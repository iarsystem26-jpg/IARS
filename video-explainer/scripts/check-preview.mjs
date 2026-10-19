import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const url = "http://localhost:3100/IARS-Explainer";
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("IARS-Explainer"),
    { timeout: 30000 },
  );
  await page.screenshot({ path: path.join(root, "qa/studio-preview.png") });
  const info = {
    url,
    httpStatus: response?.status(),
    title: await page.title(),
    compositionPresent: await page.evaluate(() =>
      document.body.innerText.includes("IARS-Explainer"),
    ),
    errors,
  };
  await fs.writeFile(
    path.join(root, "qa/studio-preview.json"),
    JSON.stringify(info, null, 2),
  );
  console.log(JSON.stringify(info));
} finally {
  await browser.close();
}
