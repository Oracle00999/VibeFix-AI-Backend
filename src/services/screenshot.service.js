const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { env } = require("../config/env");

const screenshotDir = path.join(env.storageDir, "screenshots");

const viewports = {
  desktop: { width: 1440, height: 1100 },
  mobile: { width: 390, height: 844 },
};

async function captureWebsiteScreenshots(url, auditId) {
  await fs.mkdir(screenshotDir, { recursive: true });

  try {
    return await captureWithPlaywright(url, auditId);
  } catch (error) {
    console.warn(`Screenshot capture failed for ${url}: ${error.message}`);
    return createPlaceholderScreenshots(url, auditId, error);
  }
}

async function captureWithPlaywright(url, auditId) {
  let chromium;

  try {
    process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY || "1";
    ({ chromium } = require("playwright"));
  } catch (error) {
    throw new Error("Playwright is not installed yet.");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await captureViewport(browser, url, auditId, "desktop");
    const mobile = await captureViewport(browser, url, auditId, "mobile");

    return {
      desktopScreenshot: desktop.publicUrl,
      mobileScreenshot: mobile.publicUrl,
      metadata: {
        captureMode: "playwright",
        captureStrategy: "stitched-viewports",
        desktopViewport: viewports.desktop,
        mobileViewport: viewports.mobile,
      },
    };
  } finally {
    await browser.close();
  }
}

async function captureViewport(browser, url, auditId, viewportName) {
  const page = await browser.newPage({ viewport: viewports[viewportName] });

  try {
    await navigateToPage(page, url);
    await page.waitForLoadState("networkidle", { timeout: 1000 }).catch(() => {});
    await preparePageForScreenshot(page);

    const filename = `${auditId}-${viewportName}.png`;
    const filePath = path.join(screenshotDir, filename);
    await captureStitchedScreenshot(page, filePath);

    return {
      filePath,
      publicUrl: `${env.appBaseUrl}/screenshots/${filename}`,
    };
  } finally {
    await page.close();
  }
}

async function navigateToPage(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    if (!page.url() || page.url() === "about:blank") {
      await page.goto(url, { waitUntil: "commit", timeout: 30000 });
    }
  }

  await waitForPageContent(page);
}

async function waitForPageContent(page) {
  await page
    .waitForFunction(
      () => {
        const body = document.body;

        if (!body) {
          return false;
        }

        const pageHeight = Math.max(body.scrollHeight, document.documentElement.scrollHeight);
        const hasText = body.innerText.trim().length > 80;
        const hasVisualContent = document.images.length > 0 || body.querySelector("svg, canvas, video");

        return pageHeight > window.innerHeight && hasText && hasVisualContent;
      },
      undefined,
      { timeout: 12000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1800);
}

async function captureStitchedScreenshot(page, filePath) {
  const metrics = await getPageMetrics(page);
  const headerCrop = await getHeaderCropHeight(page);
  const segmentsToCapture = getCaptureSegments(metrics.pageHeight, metrics.viewportHeight, headerCrop);
  const segments = [];

  for (const [index, segment] of segmentsToCapture.entries()) {
    await setFixedElementsVisibility(page, index === 0);
    await page.evaluate((scrollTop) => {
      window.scrollTo({ top: scrollTop, left: 0, behavior: "instant" });
    }, segment.scrollTop);
    await page.waitForTimeout(450);

    const buffer = await page.screenshot({ fullPage: false, type: "png", timeout: 30000 });

    segments.push({
      buffer,
      top: segment.top,
      cropTop: segment.cropTop,
      height: segment.height,
    });
  }

  const composites = [];

  for (const segment of segments) {
    const image =
      segment.cropTop === 0 && segment.height === metrics.viewportHeight
        ? segment.buffer
        : await sharp(segment.buffer)
            .extract({
              left: 0,
              top: segment.cropTop,
              width: metrics.viewportWidth,
              height: segment.height,
            })
            .png()
            .toBuffer();

    composites.push({
      input: image,
      left: 0,
      top: segment.top,
    });
  }

  await sharp({
    create: {
      width: metrics.viewportWidth,
      height: metrics.pageHeight,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .png()
    .toFile(filePath);

  await setFixedElementsVisibility(page, true);
}

async function setFixedElementsVisibility(page, isVisible) {
  await page.evaluate((shouldShow) => {
    const fixedElements = Array.from(document.body.querySelectorAll("*")).filter((element) => {
      const styles = window.getComputedStyle(element);
      return styles.position === "fixed" || styles.position === "sticky";
    });

    for (const element of fixedElements) {
      if (!element.dataset.polisherOriginalVisibility) {
        element.dataset.polisherOriginalVisibility = element.style.visibility || "__empty__";
      }

      if (shouldShow) {
        element.style.visibility =
          element.dataset.polisherOriginalVisibility === "__empty__"
            ? ""
            : element.dataset.polisherOriginalVisibility;
      } else {
        element.style.visibility = "hidden";
      }
    }
  }, isVisible);
}

async function getHeaderCropHeight(page) {
  const detectedHeight = await page.evaluate(() => {
    const candidates = Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const isTopChrome =
          (styles.position === "fixed" || styles.position === "sticky") &&
          rect.top <= 8 &&
          rect.height > 24 &&
          rect.height < 180 &&
          rect.width > window.innerWidth * 0.45;

        return isTopChrome ? rect.height : 0;
      })
      .filter(Boolean);

    return Math.ceil(Math.max(0, ...candidates));
  });

  return Math.min(Math.max(detectedHeight || 88, 64), 140);
}

async function getPageMetrics(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pageHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
    );

    return {
      viewportWidth,
      viewportHeight,
      pageHeight,
    };
  });
}

function getCaptureSegments(pageHeight, viewportHeight, headerCrop) {
  if (pageHeight <= viewportHeight) {
    return [
      {
        scrollTop: 0,
        cropTop: 0,
        top: 0,
        height: pageHeight,
      },
    ];
  }

  const segments = [
    {
      scrollTop: 0,
      cropTop: 0,
      top: 0,
      height: viewportHeight,
    },
  ];
  let contentTop = viewportHeight;
  let guard = 0;

  while (contentTop < pageHeight && guard < 80) {
    const scrollTop = Math.max(0, contentTop - headerCrop);
    const cropTop = contentTop - scrollTop;
    const height = Math.min(viewportHeight - cropTop, pageHeight - contentTop);

    segments.push({
      scrollTop,
      cropTop,
      top: contentTop,
      height,
    });

    contentTop += height;
    guard += 1;
  }

  return segments;
}

async function preparePageForScreenshot(page) {
  await page
    .waitForFunction(() => document.fonts?.status === "loaded", undefined, { timeout: 1500 })
    .catch(() => {});
  await eagerLoadImages(page);
  await scrollThroughPage(page);
  await waitForImages(page);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await page.waitForTimeout(450);
}

async function eagerLoadImages(page) {
  await page.evaluate(() => {
    for (const image of Array.from(document.images)) {
      image.loading = "eager";
      image.decoding = "sync";
      image.fetchPriority = "high";

      const lazySrc = image.dataset.src || image.dataset.lazySrc || image.getAttribute("data-src");
      const lazySrcSet =
        image.dataset.srcset || image.dataset.lazySrcset || image.getAttribute("data-srcset");

      if (lazySrc && !image.currentSrc) {
        image.src = lazySrc;
      }

      if (lazySrcSet && !image.srcset) {
        image.srcset = lazySrcSet;
      }
    }
  });
}

async function scrollThroughPage(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const viewportHeight = window.innerHeight || 800;
    const scrollStep = Math.max(450, Math.floor(viewportHeight * 0.75));
    const getPageHeight = () =>
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      );

    let currentY = 0;
    let pageHeight = getPageHeight();
    const maxScrolls = 18;

    for (let index = 0; index < maxScrolls && currentY < pageHeight; index += 1) {
      window.scrollTo({ top: currentY, left: 0, behavior: "instant" });
      await delay(140);

      currentY += scrollStep;
      pageHeight = getPageHeight();
    }

    window.scrollTo({ top: pageHeight, left: 0, behavior: "instant" });
    await delay(250);
  });
}

async function waitForImages(page) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.images).every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      undefined,
      { timeout: 8000 },
    )
    .catch(() => {});
}

async function createPlaceholderScreenshots(url, auditId, error) {
  const desktop = await createPlaceholderScreenshot(url, auditId, "desktop");
  const mobile = await createPlaceholderScreenshot(url, auditId, "mobile");

  return {
    desktopScreenshot: desktop.publicUrl,
    mobileScreenshot: mobile.publicUrl,
    metadata: {
      captureMode: "placeholder",
      note: "Real screenshot capture failed, so the backend used placeholder screenshots.",
      error: error ? error.message.split("\n")[0] : null,
      desktopViewport: viewports.desktop,
      mobileViewport: viewports.mobile,
    },
  };
}

async function createPlaceholderScreenshot(url, auditId, viewportName) {
  const viewport = viewports[viewportName];
  const filename = `${auditId}-${viewportName}.svg`;
  const filePath = path.join(screenshotDir, filename);
  const title = viewportName === "desktop" ? "Desktop capture" : "Mobile capture";
  const safeUrl = escapeXml(url);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}">
  <rect width="100%" height="100%" fill="#f7f2ea"/>
  <rect x="48" y="48" width="${viewport.width - 96}" height="${viewport.height - 96}" rx="18" fill="#ffffff" stroke="#172026" stroke-width="3"/>
  <rect x="84" y="90" width="${viewport.width - 168}" height="54" rx="10" fill="#172026"/>
  <rect x="84" y="190" width="${Math.min(620, viewport.width - 168)}" height="38" rx="8" fill="#2f6f73"/>
  <rect x="84" y="250" width="${Math.min(760, viewport.width - 168)}" height="18" rx="6" fill="#bac8bd"/>
  <rect x="84" y="286" width="${Math.min(680, viewport.width - 168)}" height="18" rx="6" fill="#d8a15f"/>
  <rect x="84" y="348" width="176" height="48" rx="10" fill="#d9583b"/>
  <text x="84" y="${viewport.height - 148}" fill="#172026" font-family="Arial, sans-serif" font-size="32" font-weight="700">${title}</text>
  <text x="84" y="${viewport.height - 104}" fill="#415058" font-family="Arial, sans-serif" font-size="20">${safeUrl}</text>
  <text x="84" y="${viewport.height - 70}" fill="#6a7478" font-family="Arial, sans-serif" font-size="16">Placeholder screenshot for the MVP backend flow</text>
</svg>`;

  await fs.writeFile(filePath, svg, "utf8");

  return {
    filePath,
    publicUrl: `${env.appBaseUrl}/screenshots/${filename}`,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

module.exports = { captureWebsiteScreenshots };
