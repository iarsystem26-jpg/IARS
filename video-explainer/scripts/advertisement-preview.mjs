import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const qa = path.join(root, "qa/advertisement");
await fs.mkdir(qa, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:3100/IARS-Advertisement", {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await page.waitForFunction(() =>
    document.body.innerText.includes("IARS-Advertisement"),
  );
  await page.screenshot({ path: path.join(qa, "studio.png") });
  const studio = { title: await page.title(), errors };
  const response = await page.goto("https://rmcssg.vercel.app", {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await page.evaluate(() => {
    const later = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Maybe later",
    );
    later?.click();
  });
  await page.waitForFunction(
    () => !document.body.innerText.includes("This panel closes in"),
  );
  await page.screenshot({ path: path.join(qa, "live-product.png") });
  const body = await page.evaluate(() => document.body.innerText);
  const site = {
    url: page.url(),
    status: response.status(),
    iars: body.includes("IARS"),
    title: await page.title(),
  };
  await fs.writeFile(
    path.join(qa, "preview-check.json"),
    JSON.stringify({ studio, site }, null, 2),
  );
  console.log(JSON.stringify({ studio, site }));
} finally {
  await browser.close();
}
