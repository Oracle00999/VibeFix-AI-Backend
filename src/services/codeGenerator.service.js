const auditRepository = require("../data/auditRepository");
const { env } = require("../config/env");
const { getOpenAiClient, isAiAvailable } = require("./openaiClient.service");
const { httpError } = require("../utils/httpError");

async function generateForAudit(auditId, options = {}) {
  const audit = await auditRepository.findAuditById(auditId);

  if (!audit) {
    throw httpError(404, "Audit not found.");
  }

  const format = options.format || "react-tailwind";

  if (format !== "react-tailwind") {
    throw httpError(400, "The MVP currently supports react-tailwind output only.");
  }

  if (!audit.improvedPreview) {
    throw httpError(400, "Generate an improved preview before generating code.");
  }

  const generatedCode = await buildGeneratedCode(audit, format);

  return auditRepository.updateAudit(auditId, { generatedCode });
}

async function buildGeneratedCode(audit, format) {
  if (!isAiAvailable()) {
    return buildMockGeneratedCode(audit, format);
  }

  try {
    return await buildOpenAiGeneratedCode(audit, format);
  } catch (error) {
    console.warn(`OpenAI code generation failed for audit ${audit.id}: ${error.message}`);
    return {
      ...buildMockGeneratedCode(audit, format),
      mode: "mock-fallback",
      error: error.message,
    };
  }
}

async function buildOpenAiGeneratedCode(audit, format) {
  const client = getOpenAiClient();
  const response = await client.responses.create({
    model: env.aiCodeModel,
    max_output_tokens: env.aiCodeMaxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: "generated_component",
        strict: true,
        schema: codeSchema,
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildCodePrompt(audit),
          },
        ],
      },
    ],
  });

  const parsed = parseJsonResponse(response);

  return {
    mode: "openai",
    format,
    language: "jsx",
    generatedAt: new Date().toISOString(),
    code: normalizeCode(parsed.code),
    previewHtml: normalizePreviewHtml(parsed.previewHtml),
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  };
}

function buildMockGeneratedCode(audit, format) {
  return {
    mode: "mock",
    format,
    language: "jsx",
    generatedAt: new Date().toISOString(),
    code: buildReactTailwindComponent(audit),
    previewHtml: buildPreviewHtml(audit),
  };
}

function buildCodePrompt(audit) {
  return [
    "Generate one polished full-page React + Tailwind component that improves the audited website.",
    "Return only the JSON requested by the schema.",
    "The component must be self-contained JSX, export default a component, and use Tailwind classes only.",
    "Do not include imports, markdown fences, comments, external images, or explanatory text inside the code.",
    "Keep the component focused but complete: target 160-240 lines of JSX and avoid large data arrays.",
    "Do not generate only a hero section unless the source website truly only has a hero.",
    "Preserve the important sections from improvedPreview.websiteContext.sections, improvedPreview.websiteContext.headings, and improvedPreview.wireframe.",
    "Build a complete page structure: navigation, hero, at least two meaningful content sections, a proof/details section when supported by the source, and a final CTA or footer.",
    "If the source has portfolio/projects/about/tech stack/pricing/testimonials/contact/footer sections, represent them in the generated component instead of dropping them.",
    "Also return previewHtml: a complete standalone HTML document that visually matches the generated JSX component.",
    "Keep previewHtml compact, under 9000 characters, with inline CSS only and no scripts, external assets, external fonts, iframes, or remote resources.",
    "Use a restrained, production-ready layout with accessible buttons/links and responsive behavior.",
    "Use the improved preview as the primary implementation brief. The audit report is supporting context only.",
    `Website URL: ${audit.url}`,
    `Design score: ${audit.score}`,
    `Summary: ${audit.summary}`,
    `Improved preview: ${JSON.stringify(audit.improvedPreview)}`,
    `Issues: ${JSON.stringify(audit.issues || [])}`,
    `Suggestions: ${JSON.stringify(audit.suggestions || [])}`,
  ].join("\n");
}

function parseJsonResponse(response) {
  const text = response.output_text || response.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error("OpenAI returned an empty code generation response.");
  }

  return JSON.parse(text);
}

function normalizeCode(code) {
  if (typeof code !== "string" || !code.includes("export default")) {
    throw new Error("Generated code did not include a default React export.");
  }

  return code.trim();
}

function normalizePreviewHtml(previewHtml) {
  if (typeof previewHtml !== "string" || !previewHtml.includes("<")) {
    throw new Error("Generated preview HTML was empty or invalid.");
  }

  return previewHtml.trim();
}

function buildReactTailwindComponent(audit) {
  const preview = audit.improvedPreview || {};
  const headline = preview.title || "Make your website feel sharper in minutes";
  const summary =
    preview.summary || audit.summary || "AI-backed design audit with clear fixes and improved component output.";
  const pageSections = getGeneratedSections(audit);
  const fixItems = getGeneratedFixes(audit);

  return `export default function ImprovedWebsite() {
  const pageSections = ${JSON.stringify(pageSections, null, 2)};
  const fixItems = ${JSON.stringify(fixItems, null, 2)};

  return (
    <main className="min-h-screen bg-[#f7f2ea] text-[#172026]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8">
        <a className="text-sm font-black uppercase tracking-wide text-[#172026]" href="#">
          Improved site
        </a>
        <div className="hidden items-center gap-6 text-sm font-semibold text-[#415058] sm:flex">
          <a href="#sections">Sections</a>
          <a href="#fixes">Fixes</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      <section className="px-6 pb-14 pt-10 sm:pb-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#2f6f73]">Design audit result</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
              ${escapeForTemplate(headline)}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#415058]">
              ${escapeForTemplate(summary)}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-md bg-[#d9583b] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#bf4630]" href="#contact">
                Start improving
              </a>
              <a className="rounded-md border border-[#172026]/20 px-5 py-3 text-sm font-semibold text-[#172026] transition hover:border-[#172026]" href="#sections">
                View sections
              </a>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-[#172026]/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#172026]/10 pb-3">
              <span className="text-sm font-semibold text-[#415058]">Design score</span>
              <span className="text-3xl font-bold">${audit.score || 0}</span>
            </div>
            <ul className="space-y-3 text-sm leading-6 text-[#415058]">
              {fixItems.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-[#172026]/10 bg-white px-6 py-14 lg:px-8" id="sections">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#2f6f73]">Preserved page flow</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">The redesign keeps the main sections visible.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageSections.map((section) => (
              <article className="rounded-lg border border-[#172026]/10 bg-[#f7f2ea] p-5" key={section.title}>
                <span className="text-xs font-black uppercase tracking-wide text-[#2f6f73]">{section.label}</span>
                <h3 className="mt-3 text-xl font-bold">{section.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#415058]">{section.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-14 lg:px-8" id="fixes">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#2f6f73]">Priority polish</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Focused fixes across the whole page.</h2>
          </div>
          <div className="grid gap-3">
            {fixItems.map((item) => (
              <div className="rounded-lg border border-[#172026]/10 bg-white p-4 text-sm font-medium leading-6 text-[#415058]" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#172026] px-6 py-14 text-white lg:px-8" id="contact">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#8ec5bd]">Ready state</p>
            <h2 className="mt-3 text-3xl font-bold">Cleaner layout, stronger hierarchy, preserved content.</h2>
          </div>
          <a className="inline-flex rounded-md bg-[#d9583b] px-5 py-3 text-sm font-semibold text-white" href="#">
            Use this version
          </a>
        </div>
      </section>
    </main>
  );
}`;
}

function getGeneratedSections(audit) {
  const preview = audit.improvedPreview || {};
  const contextSections = Array.isArray(preview.websiteContext?.sections) ? preview.websiteContext.sections : [];
  const layoutSections = Array.isArray(preview.layout) ? preview.layout : [];
  const wireframeSections = Array.isArray(preview.wireframe?.desktop) ? preview.wireframe.desktop : [];
  const sourceSections = contextSections.length
    ? contextSections.map((section) => ({
        label: `Section ${section.index || ""}`.trim(),
        title: section.heading || titleFromText(section.text) || "Content section",
        detail: section.text || "Keep this content visible while improving spacing, hierarchy, and scanability.",
      }))
    : layoutSections.length
      ? layoutSections.map((section) => ({
          label: section.area || "Section",
          title: section.area || "Content section",
          detail: section.after || section.before || "Refine this section with clearer hierarchy and spacing.",
        }))
      : wireframeSections.map((section, index) => ({
          label: `Step ${index + 1}`,
          title: section,
          detail: "Preserve this part of the page flow and make it cleaner, easier to scan, and more responsive.",
        }));

  const normalized = sourceSections
    .filter((section) => section.title || section.detail)
    .map((section, index) => ({
      label: section.label || `Section ${index + 1}`,
      title: String(section.title || `Section ${index + 1}`).slice(0, 80),
      detail: String(section.detail || "Improve this area with clearer spacing and visual hierarchy.").slice(0, 220),
    }))
    .slice(0, 6);

  return normalized.length
    ? normalized
    : [
        {
          label: "Section 1",
          title: "Hero",
          detail: "Create a stronger opening message with clearer CTA placement.",
        },
        {
          label: "Section 2",
          title: "Main content",
          detail: "Use balanced cards and consistent spacing for the page's supporting content.",
        },
        {
          label: "Section 3",
          title: "Final CTA",
          detail: "End with a focused action area that clearly tells users what to do next.",
        },
      ];
}

function getGeneratedFixes(audit) {
  const preview = audit.improvedPreview || {};
  const primaryFixes = Array.isArray(preview.priorityFixes) ? preview.priorityFixes : [];
  const suggestedContent = Array.isArray(preview.suggestedContent) ? preview.suggestedContent : [];
  const fixes = primaryFixes.length
    ? primaryFixes.map((item) => `${item.area}: ${item.change}`)
    : suggestedContent.length
      ? suggestedContent
      : audit.suggestions || [];

  return fixes.length ? fixes.slice(0, 6) : ["Improve hierarchy", "Normalize spacing", "Clarify primary action"];
}

function titleFromText(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.split(/[.!?]/)[0].slice(0, 80);
}

function escapeForTemplate(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

function buildPreviewHtml(audit) {
  const preview = audit.improvedPreview || {};
  const headline = escapeHtml(preview.title || "Make your website feel sharper in minutes");
  const summary = escapeHtml(
    preview.summary || audit.summary || "AI-backed design audit with clear fixes and improved component output.",
  );
  const pageSections = getGeneratedSections(audit);
  const fixItems = getGeneratedFixes(audit);
  const sectionCards = pageSections
    .map(
      (section) => `<article><span>${escapeHtml(section.label)}</span><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.detail)}</p></article>`,
    )
    .join("");
  const fixCards = fixItems.map((item) => `<div class="fix">${escapeHtml(item)}</div>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f2ea; color: #172026; }
      nav, section { padding-left: 32px; padding-right: 32px; }
      nav { max-width: 1180px; margin: 0 auto; padding-top: 22px; padding-bottom: 22px; display: flex; align-items: center; justify-content: space-between; }
      nav strong { text-transform: uppercase; font-size: 13px; letter-spacing: .04em; }
      nav div { display: flex; gap: 22px; color: #415058; font-size: 14px; font-weight: 700; }
      a { color: inherit; text-decoration: none; }
      .hero { padding-top: 48px; padding-bottom: 72px; }
      .hero-grid { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 1.05fr .95fr; gap: 44px; align-items: center; }
      .eyebrow, article span { color: #2f6f73; font-size: 13px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
      h1 { margin: 16px 0 0; max-width: 780px; font-size: clamp(44px, 6vw, 76px); line-height: .96; }
      h2 { margin: 12px 0 0; font-size: clamp(30px, 4vw, 46px); line-height: 1.05; }
      h3 { margin: 14px 0 0; font-size: 20px; }
      p { color: #415058; line-height: 1.7; }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
      .button { border-radius: 8px; padding: 14px 18px; font-size: 14px; font-weight: 800; }
      .primary { background: #d9583b; color: #fff; }
      .secondary { border: 1px solid rgba(23,32,38,.2); }
      .score, article, .fix { border: 1px solid rgba(23,32,38,.1); border-radius: 12px; background: #fff; box-shadow: 0 16px 40px rgba(23,32,38,.08); }
      .score { padding: 24px; }
      .score-top { display: flex; justify-content: space-between; border-bottom: 1px solid rgba(23,32,38,.1); padding-bottom: 14px; font-weight: 800; }
      .score-top b { font-size: 42px; }
      ul { display: grid; gap: 12px; margin: 18px 0 0; padding-left: 20px; color: #415058; line-height: 1.6; }
      .sections { background: #fff; border-top: 1px solid rgba(23,32,38,.1); border-bottom: 1px solid rgba(23,32,38,.1); padding-top: 64px; padding-bottom: 64px; }
      .inner { max-width: 1180px; margin: 0 auto; }
      .cards { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      article { background: #f7f2ea; padding: 22px; box-shadow: none; }
      .fixes { padding-top: 64px; padding-bottom: 64px; }
      .fix-grid { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: .8fr 1.2fr; gap: 32px; }
      .fix-list { display: grid; gap: 12px; }
      .fix { padding: 16px; color: #415058; font-weight: 650; box-shadow: none; }
      .cta { background: #172026; color: #fff; padding-top: 58px; padding-bottom: 58px; }
      .cta p { color: #8ec5bd; }
      @media (max-width: 820px) {
        nav div { display: none; }
        nav, section { padding-left: 18px; padding-right: 18px; }
        .hero-grid, .fix-grid, .cards { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <nav><strong>Improved site</strong><div><a href="#sections">Sections</a><a href="#fixes">Fixes</a><a href="#contact">Contact</a></div></nav>
    <section class="hero">
      <div class="hero-grid">
        <div>
          <div class="eyebrow">Design audit result</div>
          <h1>${headline}</h1>
          <p>${summary}</p>
          <div class="actions"><a class="button primary" href="#contact">Start improving</a><a class="button secondary" href="#sections">View sections</a></div>
        </div>
        <div class="score"><div class="score-top"><span>Design score</span><b>${audit.score || 0}</b></div><ul>${fixItems
          .slice(0, 4)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul></div>
      </div>
    </section>
    <section class="sections" id="sections"><div class="inner"><div class="eyebrow">Preserved page flow</div><h2>The redesign keeps the main sections visible.</h2><div class="cards">${sectionCards}</div></div></section>
    <section class="fixes" id="fixes"><div class="fix-grid"><div><div class="eyebrow">Priority polish</div><h2>Focused fixes across the whole page.</h2></div><div class="fix-list">${fixCards}</div></div></section>
    <section class="cta" id="contact"><div class="inner"><p class="eyebrow">Ready state</p><h2>Cleaner layout, stronger hierarchy, preserved content.</h2></div></section>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = { generateForAudit };

const codeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "previewHtml", "notes"],
  properties: {
    code: {
      type: "string",
    },
    previewHtml: {
      type: "string",
    },
    notes: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
      },
    },
  },
};
