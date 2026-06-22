const path = require("path");
const fs = require("fs");

loadDotEnv();

const port = Number(process.env.PORT || 5055);

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://localhost:5432/ai_website_design_polisher",
  dbConnectionTimeoutMs: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  aiEnabled: process.env.AI_ENABLED === "true",
  aiAuditModel: process.env.AI_AUDIT_MODEL || "gpt-5.4-mini",
  aiCodeModel: process.env.AI_CODE_MODEL || "gpt-5.4-mini",
  aiCodeMaxOutputTokens: Number(process.env.AI_CODE_MAX_OUTPUT_TOKENS || 11000),
  aiImageMaxWidth: Number(process.env.AI_IMAGE_MAX_WIDTH || 1200),
  aiImageQuality: Number(process.env.AI_IMAGE_QUALITY || 82),
  storageDir: process.env.STORAGE_DIR || path.join(__dirname, "..", "..", "storage"),
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${port}`,
};

function loadDotEnv() {
  const envFilePath = path.join(__dirname, "..", "..", ".env");

  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

module.exports = { env };
