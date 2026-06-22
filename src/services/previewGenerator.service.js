const auditRepository = require("../data/auditRepository");
const { env } = require("../config/env");
const { getOpenAiClient, isAiAvailable } = require("./openaiClient.service");
const { httpError } = require("../utils/httpError");

async function generateForAudit(auditId) {
  const audit = await auditRepository.findAuditById(auditId);

  if (!audit) {
    throw httpError(404, "Audit not found.");
  }

  const improvedPreview = await buildImprovedPreview(audit);

  return auditRepository.updateAudit(auditId, { improvedPreview });
}

async function buildImprovedPreview(audit) {
  if (!isAiAvailable()) {
    return buildMockPreview(audit);
  }

  try {
    return await buildOpenAiPreview(audit);
  } catch (error) {
    console.warn(`OpenAI preview generation failed for audit ${audit.id}: ${error.message}`);

    return {
      ...(await buildMockPreview(audit)),
      mode: "mock-fallback",
      error: error.message,
    };
  }
}

async function buildOpenAiPreview(audit) {
  const client = getOpenAiClient();
  const websiteContext = await extractWebsiteContext(audit.url);
  const response = await client.responses.create({
    model: env.aiCodeModel,
    max_output_tokens: 1700,
    text: {
      format: {
        type: "json_schema",
        name: "improved_design_preview",
        strict: true,
        schema: previewSchema,
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildPreviewPrompt(audit, websiteContext),
          },
        ],
      },
    ],
  });

  const parsed = parseJsonResponse(response);

  return {
    ...normalizePreview(parsed, "openai"),
    websiteContext,
  };
}

function buildPreviewPrompt(audit, websiteContext = null) {
  return [
    "Create a practical improved design preview from this website audit.",
    "Return only the structured JSON requested by the schema.",
    "This is a preview plan that will later be used as the source of truth for code generation.",
    "Make the changes specific enough for a React/Tailwind component generator to implement.",
    "Use the website content outline to preserve the important sections and avoid dropping meaningful content.",
    "Cover the full page structure where possible, not only the hero. Include layout entries for major detected sections such as about, projects, services, tech stack, pricing, testimonials, contact, or footer.",
    "Use the detected headings and section text to name sections realistically instead of replacing everything with generic content.",
    "Do not invent a full brand identity. Preserve the website's likely intent while improving polish, hierarchy, spacing, CTA clarity, layout, and responsiveness.",
    `Website URL: ${audit.url}`,
    `Design score: ${audit.score}`,
    `Audit summary: ${audit.summary}`,
    `Issues: ${JSON.stringify(audit.issues || [])}`,
    `Suggestions: ${JSON.stringify(audit.suggestions || [])}`,
    `Before/after notes: ${JSON.stringify(audit.beforeAfter || {})}`,
    `Website content outline: ${JSON.stringify(websiteContext || {})}`,
  ].join("\n");
}

async function buildMockPreview(audit) {
  const highPriorityIssues = (audit.issues || [])
    .filter((issue) => issue.severity === "high" || issue.severity === "medium")
    .slice(0, 4);
  const suggestions = (audit.suggestions || []).slice(0, 5);

  return {
    mode: "mock",
    generatedAt: new Date().toISOString(),
    title: "Cleaner conversion-focused redesign preview",
    summary:
      "This preview keeps the existing product direction but reduces visual noise, tightens hierarchy, and makes the primary action easier to notice.",
    layout: [
      {
        area: "Hero",
        before: "Primary message competes with surrounding visual elements.",
        after: "Use one strong headline, shorter support copy, and a primary CTA aligned close to the core message.",
      },
      {
        area: "Navigation",
        before: "Header actions can feel visually equal to page content.",
        after: "Keep navigation compact and let the page headline own the first visual moment.",
      },
      {
        area: "Content Sections",
        before: "Repeated sections may feel uneven or visually heavy.",
        after: "Use a consistent card grid, predictable spacing, and clear section headings.",
      },
      {
        area: "Mobile",
        before: "The mobile view may need clearer stacking and touch target spacing.",
        after: "Stack content in a single confident column with roomy buttons and reduced competing elements.",
      },
    ],
    visualDirection: {
      spacing: "Increase section padding, normalize card gaps, and use a smaller set of spacing values.",
      typography: "Create a sharper type scale with one dominant heading, one support paragraph style, and compact card titles.",
      cta: "Use one primary CTA color and keep secondary actions visually quieter.",
      cards: "Use equal card padding and consistent media height so repeated content scans cleanly.",
    },
    priorityFixes: highPriorityIssues.map((issue) => ({
      area: issue.area,
      change: issue.suggestion,
    })),
    suggestedContent: suggestions,
    wireframe: {
      desktop: ["Compact nav", "Hero headline + CTA", "Proof/metrics row", "Balanced feature cards", "Focused final CTA"],
      mobile: ["Top nav", "Hero stack", "Primary CTA", "One-column cards", "Contact/final CTA"],
    },
  };
}

async function extractWebsiteContext(url) {
  let chromium;

  try {
    ({ chromium } = require("playwright"));
  } catch {
    return null;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 1200 }).catch(() => {});
    await page.waitForTimeout(800);

    return await page.evaluate(() => {
      const cleanText = (value, limit = 220) =>
        String(value || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limit);

      const visibleText = (element, limit = 420) => {
        const styles = window.getComputedStyle(element);

        if (styles.display === "none" || styles.visibility === "hidden") {
          return "";
        }

        return cleanText(element.innerText || element.textContent || "", limit);
      };

      const title = cleanText(document.title, 140);
      const metaDescription = cleanText(
        document.querySelector('meta[name="description"]')?.getAttribute("content"),
        220,
      );
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((element) => ({
          level: element.tagName.toLowerCase(),
          text: cleanText(element.innerText || element.textContent, 160),
        }))
        .filter((item) => item.text)
        .slice(0, 24);
      const navigation = Array.from(document.querySelectorAll("nav a, header a"))
        .map((element) => cleanText(element.innerText || element.textContent, 80))
        .filter(Boolean)
        .slice(0, 16);
      const callsToAction = Array.from(document.querySelectorAll("button, a"))
        .map((element) => cleanText(element.innerText || element.textContent, 80))
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .slice(0, 18);
      const sectionElements = Array.from(document.querySelectorAll("section, main > div, article"));
      const sections = sectionElements
        .map((element, index) => {
          const heading = cleanText(element.querySelector("h1, h2, h3")?.innerText, 140);
          const text = visibleText(element, 520);

          return {
            index: index + 1,
            heading,
            text,
          };
        })
        .filter((section) => section.heading || section.text)
        .slice(0, 14);

      return {
        title,
        metaDescription,
        headings,
        navigation,
        callsToAction,
        sections,
      };
    });
  } catch (error) {
    console.warn(`Could not extract website context for ${url}: ${error.message}`);
    return null;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function parseJsonResponse(response) {
  const text = response.output_text || response.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error("OpenAI returned an empty preview generation response.");
  }

  return JSON.parse(text);
}

function normalizePreview(preview, mode) {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    title: safeText(preview.title, "Improved website preview"),
    summary: safeText(preview.summary, "A cleaner, more focused design direction for the audited page."),
    layout: normalizeLayout(preview.layout).slice(0, 6),
    visualDirection: {
      spacing: safeText(preview.visualDirection?.spacing, "Use consistent section padding and card gaps."),
      typography: safeText(preview.visualDirection?.typography, "Use a clearer type scale and stronger headline hierarchy."),
      cta: safeText(preview.visualDirection?.cta, "Make the primary CTA visually dominant and place it near the core message."),
      cards: safeText(preview.visualDirection?.cards, "Normalize card padding, media sizing, and spacing."),
    },
    priorityFixes: normalizePriorityFixes(preview.priorityFixes).slice(0, 5),
    suggestedContent: normalizeStringArray(preview.suggestedContent).slice(0, 6),
    wireframe: {
      desktop: normalizeStringArray(preview.wireframe?.desktop).slice(0, 7),
      mobile: normalizeStringArray(preview.wireframe?.mobile).slice(0, 7),
    },
  };
}

function normalizeLayout(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    area: safeText(item.area, "Section"),
    before: safeText(item.before, "This area can feel less focused than it should."),
    after: safeText(item.after, "Refine the layout, spacing, and hierarchy for a more polished result."),
  }));
}

function normalizePriorityFixes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    area: safeText(item.area, "General"),
    change: safeText(item.change, "Improve hierarchy, spacing, and clarity in this area."),
  }));
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function safeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

module.exports = {
  generateForAudit,
};

const previewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "layout", "visualDirection", "priorityFixes", "suggestedContent", "wireframe"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    layout: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "before", "after"],
        properties: {
          area: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
        },
      },
    },
    visualDirection: {
      type: "object",
      additionalProperties: false,
      required: ["spacing", "typography", "cta", "cards"],
      properties: {
        spacing: { type: "string" },
        typography: { type: "string" },
        cta: { type: "string" },
        cards: { type: "string" },
      },
    },
    priorityFixes: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "change"],
        properties: {
          area: { type: "string" },
          change: { type: "string" },
        },
      },
    },
    suggestedContent: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    wireframe: {
      type: "object",
      additionalProperties: false,
      required: ["desktop", "mobile"],
      properties: {
        desktop: {
          type: "array",
          maxItems: 7,
          items: { type: "string" },
        },
        mobile: {
          type: "array",
          maxItems: 7,
          items: { type: "string" },
        },
      },
    },
  },
};
