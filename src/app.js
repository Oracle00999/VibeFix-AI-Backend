const express = require("express");
const path = require("path");
const auditRoutes = require("./routes/audit.routes");
const healthRoutes = require("./routes/health.routes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use("/screenshots", express.static(path.join(__dirname, "..", "storage", "screenshots")));

app.use("/api/health", healthRoutes);
app.use("/api/audits", auditRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

app.use(errorHandler);

module.exports = app;
