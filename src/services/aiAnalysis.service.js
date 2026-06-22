const { env } = require("../config/env");
const { optimizeScreenshotForAi } = require("./imageOptimizer.service");
const { getOpenAiClient, isAiAvailable } = require("./openaiClient.service");

async function analyzeDesign({ url, screenshots, rules }) {
  if (!isAiAvailable()) {
    return buildMockAnalysis({ url, screenshots, rules });
  }

  try {
    const analysis = await analyzeWithOpenAi({ url, screenshots, rules });
    return normalizeAnalysis(analysis, { url, screenshots, rules, mode: "openai" });
  } catch (error) {
    console.warn(`OpenAI design analysis failed for ${url}: ${error.message}`);
    const fallback = buildMockAnalysis({ url, screenshots, rules });

    return {
      ...fallback,
      aiMode: "mock-fallback",
      aiError: error.message,
    };
  }
}

async function analyzeWithOpenAi({ url, screenshots, rules }) {
  const client = getOpenAiClient();
  const desktopImage = await optimizeScreenshotForAi(screenshots.desktopScreenshot, "desktop");
  const mobileImage = await optimizeScreenshotForAi(screenshots.mobileScreenshot, "mobile");

  const response = await client.responses.create({
    model: env.aiAuditModel,
    max_output_tokens: 1800,
    text: {
      format: {
        type: "json_schema",
        name: "website_design_audit",
        strict: true,
        schema: auditSchema,
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildAuditPrompt({ url, rules }),
          },
          {
            type: "input_image",
            image_url: desktopImage.dataUrl,
          },
          {
            type: "input_image",
            image_url: mobileImage.dataUrl,
          },
        ],
      },
    ],
  });

  return parseJsonResponse(response);
}

function buildAuditPrompt({ url, rules }) {
  return [
    "You are a senior product designer auditing a website from desktop and mobile screenshots.",
    "Return only the structured JSON requested by the schema.",
    `Website URL: ${url}`,
    "Focus on visual hierarchy, spacing, alignment, CTA clarity, card layout, typography, contrast, responsiveness, and perceived polish.",
    "Be practical and specific. Avoid generic advice.",
    "Treat the first image as desktop and the second image as mobile.",
    `Known deterministic rule checks: ${JSON.stringify(rules)}`,
  ].join("\n");
}

function buildMockAnalysis({ url, screenshots, rules }) {
  const ruleIssues = rules.map((rule) => ({
    title: rule.title,
    severity: rule.severity,
    area: rule.area,
    explanation: rule.message,
    suggestion: rule.suggestion,
  }));

  const issues = [
    ...ruleIssues,
    {
      title: "Hero section needs clearer visual priority",
      severity: "medium",
      area: "Hero",
      explanation: "The first screen should make the primary message and action obvious within a few seconds.",
      suggestion: "Use one strong headline, one short supporting line, and one primary CTA near the main message.",
    },
    {
      title: "Card spacing should feel more consistent",
      severity: "low",
      area: "Layout",
      explanation: "Uneven spacing makes otherwise good sections feel less polished.",
      suggestion: "Use a consistent spacing scale for cards, gutters, and section padding.",
    },
  ];

  const score = Math.max(55, 92 - issues.length * 6);

  return {
    aiMode: "mock",
    score,
    summary: `Initial design audit for ${url}. The page has a workable foundation, but the MVP analysis recommends sharper hierarchy, clearer CTA placement, and more consistent spacing.`,
    issues,
    suggestions: [
      "Make the primary headline the strongest text element above the fold.",
      "Place the main CTA close to the value proposition.",
      "Reduce competing visual elements in the hero section.",
      "Use consistent spacing tokens for repeated content blocks.",
      "Check mobile layout for overflow and cramped touch targets.",
    ],
    beforeAfter: {
      before: [
        "Crowded first screen",
        "Weak heading hierarchy",
        "CTA placement may not be obvious",
        "Spacing can feel inconsistent across repeated sections",
      ],
      after: [
        "Cleaner hero spacing",
        "Stronger headline and supporting copy",
        "CTA positioned near the strongest conversion moment",
        "Balanced card layout with predictable gaps",
      ],
    },
    screenshots,
  };
}

function parseJsonResponse(response) {
  const text = response.output_text || response.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error("OpenAI returned an empty analysis response.");
  }

  return JSON.parse(text);
}

function normalizeAnalysis(analysis, context) {
  const ruleIssues = context.rules.map((rule) => ({
    title: rule.title,
    severity: rule.severity,
    area: rule.area,
    explanation: rule.message,
    suggestion: rule.suggestion,
  }));

  const modelIssues = Array.isArray(analysis.issues) ? analysis.issues : [];
  const issues = [...ruleIssues, ...modelIssues].map(normalizeIssue).slice(0, 10);

  return {
    aiMode: context.mode,
    score: clampScore(analysis.score),
    summary:
      typeof analysis.summary === "string" && analysis.summary.trim()
        ? analysis.summary.trim()
        : `Design audit for ${context.url}.`,
    issues,
    suggestions: normalizeStringArray(analysis.suggestions).slice(0, 8),
    beforeAfter: {
      before: normalizeStringArray(analysis.beforeAfter?.before).slice(0, 6),
      after: normalizeStringArray(analysis.beforeAfter?.after).slice(0, 6),
    },
    screenshots: context.screenshots,
  };
}

function normalizeIssue(issue) {
  return {
    title: safeText(issue.title, "Design issue"),
    severity: ["high", "medium", "low"].includes(issue.severity) ? issue.severity : "medium",
    area: safeText(issue.area, "General"),
    explanation: safeText(issue.explanation, "This area may reduce perceived design quality."),
    suggestion: safeText(issue.suggestion, "Refine this area for a clearer, more polished layout."),
  };
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function safeText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 70;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

const auditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "summary", "issues", "suggestions", "beforeAfter"],
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
    summary: {
      type: "string",
    },
    issues: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "area", "explanation", "suggestion"],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          area: { type: "string" },
          explanation: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
    suggestions: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    beforeAfter: {
      type: "object",
      additionalProperties: false,
      required: ["before", "after"],
      properties: {
        before: {
          type: "array",
          maxItems: 6,
          items: { type: "string" },
        },
        after: {
          type: "array",
          maxItems: 6,
          items: { type: "string" },
        },
      },
    },
  },
};

module.exports = {
  analyzeDesign,
};
