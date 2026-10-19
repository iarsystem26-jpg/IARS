import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  renderStill,
  openBrowser,
} from "@remotion/renderer";
import fs from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const qa = path.join(root, "qa/advertisement");
await fs.mkdir(qa, { recursive: true });
const mode = process.argv[2] || "stills";
const browserExecutable =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const serveUrl = process.argv.includes("--reuse-bundle")
  ? path.join(qa, "bundle")
  : await bundle({
      entryPoint: path.join(root, "src/index.ts"),
      outDir: path.join(qa, "bundle"),
      rspack: true,
      onProgress: (p) => {
        if (p === 100) console.log("Bundle ready");
      },
    });
const browser = await openBrowser("chrome", { browserExecutable });
try {
  const composition = await selectComposition({
    serveUrl,
    id: "IARS-Advertisement",
    browserExecutable,
    puppeteerInstance: browser,
  });
  console.log(
    JSON.stringify({
      mode,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      frames: composition.durationInFrames,
    }),
  );
  if (mode === "stills") {
    const requestedFrames = process.argv.find((arg) =>
      arg.startsWith("--frames="),
    );
    for (const frame of requestedFrames
      ? requestedFrames.split("=")[1].split(",").map(Number)
      : [0, 90, 210, 239, 240, 300, 410, 519, 534, 600, 659, 660, 750, 899]) {
      await renderStill({
        composition,
        serveUrl,
        browserExecutable,
        puppeteerInstance: browser,
        inputProps: { audio: false },
        frame,
        output: path.join(qa, `frame-${frame}.png`),
        scale: 0.5,
        imageFormat: "png",
      });
      console.log(`Frame ${frame} ready`);
    }
  } else {
    let bucket = -1;
    const start = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      browserExecutable,
      puppeteerInstance: browser,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "320k",
      crf: 16,
      x264Preset: "medium",
      imageFormat: "png",
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      concurrency: 1,
      ffmpegOverride: ({ args }) => [
        ...args.slice(0, -1),
        "-threads",
        "2",
        args[args.length - 1],
      ],
      timeoutInMilliseconds: 120000,
      scale: mode === "test" ? 0.5 : 1,
      frameRange: mode === "test" ? [450, 569] : undefined,
      outputLocation:
        mode === "test"
          ? path.join(qa, "interaction-test.mp4")
          : path.join(root, "IARS-Advertisement-4K-60FPS.mp4"),
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const b = Math.floor(progress * 20);
        if (b !== bucket) {
          bucket = b;
          console.log(
            `${Math.round(progress * 100)}%: ${renderedFrames} rendered / ${encodedFrames} encoded`,
          );
        }
      },
    });
  execFileSync('python', [path.join(root, 'scripts/advertisement-finalize.py'), mode], {stdio: 'inherit'});
  await fs.writeFile(
      path.join(qa, `${mode}-render.json`),
      JSON.stringify(
        {
          mode,
          elapsedSeconds: (Date.now() - start) / 1000,
          width: composition.width * (mode === "test" ? 0.5 : 1),
          height: composition.height * (mode === "test" ? 0.5 : 1),
          fps: 60,
          frames: mode === "test" ? 120 : 900,
          audioMounted: ["narration.wav", "music.wav", "effects.wav"],
          muted: false,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await browser.close({ silent: true });
}
// Rspack can retain worker handles after all awaited output and browser cleanup.
process.exit(0);
