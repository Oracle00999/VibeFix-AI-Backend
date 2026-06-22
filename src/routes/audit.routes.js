const express = require("express");
const auditController = require("../controllers/audit.controller");

const router = express.Router();

router.post("/", auditController.createAudit);
router.get("/", auditController.listAudits);
router.get("/:id", auditController.getAudit);
router.delete("/:id", auditController.deleteAudit);
router.post("/:id/generate-preview", auditController.generatePreview);
router.post("/:id/generate-code", auditController.generateCode);

module.exports = router;
