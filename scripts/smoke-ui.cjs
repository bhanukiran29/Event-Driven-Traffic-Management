const fs = require("node:fs");
const { chromium } = require("playwright");

const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

async function main() {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const failedResponses = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle", timeout: 60000 });
  const title = await page.locator("h1").innerText();
  const initialText = await page.locator("body").innerText({ timeout: 10000 });

  await page.getByRole("button", { name: "City Map" }).click();
  await page.waitForTimeout(3000);
  const mapCanvas = await page.locator("canvas").count();

  await page.getByRole("button", { name: "Simulator" }).click();
  await page.getByRole("button", { name: "Recalculate TIS" }).click();
  await page.waitForTimeout(1000);
  const simulatorText = await page.locator("body").innerText();

  await page.getByRole("button", { name: "Copilot" }).click();
  await page.getByRole("button", { name: "Ask Copilot" }).click();
  await page.waitForTimeout(1000);
  const copilotText = await page.locator("body").innerText();

  await page.screenshot({ path: "public/smoke-desktop.png", fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await mobile.goto("http://127.0.0.1:3000", { waitUntil: "networkidle", timeout: 60000 });
  const mobileNoPageOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  await mobile.screenshot({ path: "public/smoke-mobile.png", fullPage: true });
  await mobile.close();
  await browser.close();

  console.log(
    JSON.stringify(
      {
        title,
        hasGridSense: initialText.includes("GridSense AI"),
        hasNotice: initialText.includes("operational traffic impact risk"),
        mapCanvas,
        mobileNoPageOverflow,
        simulatorWorked: simulatorText.includes("Scenario TIS") || simulatorText.includes("Baseline TIS"),
        copilotWorked: copilotText.includes("ASTraM") || copilotText.includes("Citywide operational risk"),
        failedResponses,
        errors
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
