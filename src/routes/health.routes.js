const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "ai-website-design-polisher-api",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
