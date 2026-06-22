const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { env } = require("../config/env");

const screenshotDir = path.join(env.storageDir, "screenshots");
const optimizedDir = path.join(env.storageDir, "ai-inputs");

async function optimizeScreenshotForAi(screenshotUrl, label) {
  const sourcePath = resolveScreenshotPath(screenshotUrl);
  const filename = `${path.parse(sourcePath).name}-${label}-ai.jpg`;
  const outputPath = path.join(optimizedDir, filename);

  await fs.mkdir(optimizedDir, { recursive: true });

  const image = sharp(sourcePath, { limitInputPixels: false });
  const metadata = await image.metadata();
  const resizeOptions =
    metadata.width && metadata.width > env.aiImageMaxWidth
      ? { width: env.aiImageMaxWidth, withoutEnlargement: true }
      : null;

  let pipeline = image;

  if (resizeOptions) {
    pipeline = pipeline.resize(resizeOptions);
  }

  await pipeline
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: env.aiImageQuality, mozjpeg: true })
    .toFile(outputPath);

  const imageBuffer = await fs.readFile(outputPath);

  return {
    path: outputPath,
    dataUrl: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
  };
}

function resolveScreenshotPath(screenshotUrl) {
  const filename = path.basename(new URL(screenshotUrl).pathname);
  return path.join(screenshotDir, filename);
}

module.exports = {
  optimizeScreenshotForAi,
};
