function runDesignRules({ url, screenshotMetadata }) {
  const rules = [
    {
      id: "desktop-mobile-required",
      title: "Desktop and mobile views should both be reviewed",
      severity: "medium",
      area: "Responsive design",
      passed: true,
      message: "The audit includes separate desktop and mobile views.",
      suggestion: "Keep comparing both viewport sizes before approving a redesign.",
    },
  ];

  if (screenshotMetadata.captureMode === "placeholder") {
    rules.push({
      id: "real-screenshot-needed",
      title: "Real screenshot capture fell back to placeholders",
      severity: "high",
      area: "Capture pipeline",
      passed: false,
      message:
        screenshotMetadata.error ||
        "This audit used generated placeholder screenshots because the live capture did not complete.",
      suggestion:
        "Check that the URL is publicly reachable, does not block headless browsers, and can load within the screenshot timeout.",
    });
  }

  if (url.length > 80) {
    rules.push({
      id: "long-url-review",
      title: "Long landing page URL detected",
      severity: "low",
      area: "Input",
      passed: false,
      message: "Long campaign URLs can hide tracking parameters that do not affect design quality.",
      suggestion: "Consider storing a canonical URL alongside the submitted audit URL.",
    });
  }

  return rules;
}

module.exports = { runDesignRules };
