const auditService = require("../services/audit.service");
const codeGeneratorService = require("../services/codeGenerator.service");
const previewGeneratorService = require("../services/previewGenerator.service");

async function createAudit(req, res, next) {
  try {
    const audit = await auditService.runUrlAudit(req.body);
    res.status(201).json({ audit });
  } catch (error) {
    next(error);
  }
}

async function listAudits(req, res, next) {
  try {
    const audits = await auditService.listAudits();
    res.json({ audits });
  } catch (error) {
    next(error);
  }
}

async function getAudit(req, res, next) {
  try {
    const audit = await auditService.getAudit(req.params.id);
    res.json({ audit });
  } catch (error) {
    next(error);
  }
}

async function generateCode(req, res, next) {
  try {
    const audit = await codeGeneratorService.generateForAudit(req.params.id, req.body);
    res.json({ audit, generatedCode: audit.generatedCode });
  } catch (error) {
    next(error);
  }
}

async function generatePreview(req, res, next) {
  try {
    const audit = await previewGeneratorService.generateForAudit(req.params.id);
    res.json({ audit, improvedPreview: audit.improvedPreview });
  } catch (error) {
    next(error);
  }
}

async function deleteAudit(req, res, next) {
  try {
    const audit = await auditService.deleteAudit(req.params.id);
    res.json({ audit });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAudit,
  listAudits,
  getAudit,
  deleteAudit,
  generatePreview,
  generateCode,
};
