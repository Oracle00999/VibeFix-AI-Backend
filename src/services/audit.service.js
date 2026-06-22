const fs = require("fs/promises");
const path = require("path");
const auditRepository = require("../data/auditRepository");
const { env } = require("../config/env");
const { normalizeAndValidateUrl } = require("./url.service");
const { captureWebsiteScreenshots } = require("./screenshot.service");
const { analyzeDesign } = require("./aiAnalysis.service");
const { runDesignRules } = require("./designRules.service");
const { httpError } = require("../utils/httpError");

async function runUrlAudit(input) {
  const url = normalizeAndValidateUrl(input.url);
  const audit = await auditRepository.createAudit({ url, status: "pending" });

  try {
    const screenshots = await captureWebsiteScreenshots(url, audit.id);
    const rules = runDesignRules({ url, screenshotMetadata: screenshots.metadata });
    const analysis = await analyzeDesign({ url, screenshots, rules });

    return auditRepository.updateAudit(audit.id, {
      status: "completed",
      desktopScreenshot: screenshots.desktopScreenshot,
      mobileScreenshot: screenshots.mobileScreenshot,
      score: analysis.score,
      issues: analysis.issues,
      summary: analysis.summary,
      suggestions: analysis.suggestions,
      beforeAfter: analysis.beforeAfter,
      rules,
    });
  } catch (error) {
    const failedAudit = await auditRepository.updateAudit(audit.id, {
      status: "failed",
      summary: error.message,
    });

    throw httpError(500, failedAudit.summary || "Audit failed.");
  }
}

async function listAudits() {
  return auditRepository.listAudits();
}

async function getAudit(id) {
  const audit = await auditRepository.findAuditById(id);

  if (!audit) {
    throw httpError(404, "Audit not found.");
  }

  return audit;
}

async function deleteAudit(id) {
  const audit = await auditRepository.deleteAudit(id);

  if (!audit) {
    throw httpError(404, "Audit not found.");
  }

  await cleanupAuditFiles(audit);

  return audit;
}

async function cleanupAuditFiles(audit) {
  const screenshotDir = path.join(env.storageDir, "screenshots");
  const aiInputDir = path.join(env.storageDir, "ai-inputs");

  await Promise.all([
    removeFileFromUrl(audit.desktopScreenshot, screenshotDir),
    removeFileFromUrl(audit.mobileScreenshot, screenshotDir),
    removeFilesByPrefix(aiInputDir, audit.id),
  ]);
}

async function removeFileFromUrl(fileUrl, directory) {
  if (!fileUrl) {
    return;
  }

  try {
    const filename = path.basename(new URL(fileUrl).pathname);
    await fs.rm(path.join(directory, filename), { force: true });
  } catch (error) {
    console.warn(`Could not remove stored audit file: ${error.message}`);
  }
}

async function removeFilesByPrefix(directory, prefix) {
  try {
    const files = await fs.readdir(directory);
    await Promise.all(
      files
        .filter((file) => file.startsWith(prefix))
        .map((file) => fs.rm(path.join(directory, file), { force: true })),
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not remove generated audit files: ${error.message}`);
    }
  }
}

module.exports = {
  runUrlAudit,
  listAudits,
  getAudit,
  deleteAudit,
};
