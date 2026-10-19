import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
await fs.mkdir(path.join(root, "qa/references"), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
try {
  for (const [name, url] of [
    ["iars", "https://rmcssg.vercel.app"],
    ["linear", "https://linear.app"],
    ["framer", "https://www.framer.com/blog/framer-3/"],
    ["stripe", "https://stripe.com/payments"],
  ]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      if (name === "iars")
        await page
          .waitForFunction(
            () => /IARS|Institution Attendance/.test(document.body.innerText),
            { timeout: 25000 },
          )
          .catch(() => {});
      if (name !== "iars")
        await page
          .waitForFunction(() => document.body.innerText.length > 200, {
            timeout: 10000,
          })
          .catch(() => {});
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const data = await page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText.slice(0, 4500),
        videos: [...document.querySelectorAll("video")].map((v) => ({
          src: v.currentSrc || v.src,
          poster: v.poster,
        })),
        iframes: [...document.querySelectorAll("iframe")]
          .map((f) => f.src)
          .filter((s) => /youtube|vimeo/.test(s)),
      }));
      await page.screenshot({
        path: path.join(root, "qa/references", name + ".png"),
      });
      results.push({ name, url, status: response?.status(), ...data });
      if (name === "framer" && data.videos.length) {
        await page.evaluate(() => {
          const v = document.querySelector("video");
          if (v) {
            v.pause();
            v.scrollIntoView({ block: "center" });
          }
        });
        const samples = [];
        for (const seconds of [0, 2, 5, 9]) {
          try {
            await page.evaluate(async (seconds) => {
              const v = document.querySelector("video");
              if (!v) return;
              v.muted = true;
              await v.play().catch(() => {});
              v.pause();
              if (v.readyState < 1)
                await new Promise((resolve) =>
                  v.addEventListener("loadedmetadata", resolve, { once: true }),
                );
              v.currentTime = Math.min(seconds, v.duration - 0.1);
              await new Promise((resolve) =>
                v.addEventListener("seeked", resolve, { once: true }),
              );
            }, seconds);
            await page.screenshot({
              path: path.join(
                root,
                "qa/references",
                `framer-motion-${seconds}.png`,
              ),
            });
            samples.push(seconds);
          } catch {}
        }
        results[results.length - 1].motionSamples = samples;
      }
    } catch (error) {
      results.push({ name, url, error: String(error) });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
await fs.writeFile(
  path.join(root, "qa/research.json"),
  JSON.stringify(results, null, 2),
);
const live = results.find((r) => r.name === "iars");
const verified =
  live?.status === 200 && /IARS|Institution Attendance/.test(live.text || "");
await fs.mkdir(path.join(root, "src"), { recursive: true });
await fs.writeFile(
  path.join(root, "src/site.json"),
  JSON.stringify(
    { url: verified ? "rmcssg.vercel.app" : "", verified },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ name, status, title, videos, iframes, error }) => ({
      name,
      status,
      title,
      videos,
      iframes,
      error,
    })),
    null,
    2,
  ),
);
