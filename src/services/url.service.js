const { httpError } = require("../utils/httpError");

function normalizeAndValidateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw httpError(400, "A website URL is required.");
  }

  const trimmedUrl = rawUrl.trim();
  const urlWithProtocol = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;

  let parsedUrl;

  try {
    parsedUrl = new URL(urlWithProtocol);
  } catch (error) {
    throw httpError(400, "Please submit a valid website URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw httpError(400, "Only http and https URLs are supported.");
  }

  if (!parsedUrl.hostname.includes(".")) {
    throw httpError(400, "Please submit a public website domain.");
  }

  return parsedUrl.toString();
}

module.exports = { normalizeAndValidateUrl };
