import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  renderStill,
} from "@remotion/renderer";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2] || "final";
// Capture the vector/HTML source at double pixel density, then encode it at 4K.
const renderScale = 2;
const renderCrf = 12;
const browserExecutable =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/index.ts"),
  outDir: path.join(root, "qa/bundle"),
});
const composition = await selectComposition({
  serveUrl,
  id: "IARS-Explainer",
  browserExecutable,
  inputProps: { audio: false },
});
console.log(
  JSON.stringify({
    id: composition.id,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
    outputWidth: composition.width * renderScale,
    outputHeight: composition.height * renderScale,
  }),
);
await fs.mkdir(path.join(root, "qa/stills"), { recursive: true });
if (mode === "stills") {
  const frames =
    process.argv.length > 3
      ? process.argv.slice(3).map(Number)
      : [
          0, 30, 180, 330, 440, 490, 640, 780, 835, 903, 975, 1019, 1047, 1100,
          1165, 1170, 1213, 1390, 1500, 1620, 1770, 1799,
        ].map((frame) => Math.round((frame * composition.fps) / 30));
  for (let i = 0; i < frames.length; i += 3) {
    await Promise.all(
      frames.slice(i, i + 3).map(async (frame) => {
        await renderStill({
          composition,
          serveUrl,
          frame,
          inputProps: { audio: false },
          output: path.join(
            root,
            "qa/stills",
            `frame-${String(frame).padStart(4, "0")}.png`,
          ),
          imageFormat: "png",
          scale: renderScale,
          browserExecutable,
        });
        console.log(`Inspected frame ready: ${frame}`);
      }),
    );
  }
} else {
  let bucket = -1;
  const start = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    inputProps: { audio: false },
    muted: true,
    codec: "h264",
    audioCodec: "aac",
    crf: renderCrf,
    x264Preset: "slow",
    imageFormat: "png",
    scale: renderScale,
    colorSpace: "bt709",
    pixelFormat: "yuv420p",
    audioBitrate: "320k",
    outputLocation: path.join(root, "product-explainer-60s.mp4"),
    browserExecutable,
    concurrency: 4,
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      const next = Math.floor(progress * 20);
      if (next !== bucket) {
        bucket = next;
        console.log(
          `Rendering ${(progress * 100).toFixed(0)}% — ${renderedFrames} frames rendered, ${encodedFrames} encoded`,
        );
      }
    },
  });
  execFileSync("python", [path.join(root, "scripts/finalize-mp4.py")], {
    stdio: "inherit",
  });
  const stat = await fs.stat(path.join(root, "product-explainer-60s.mp4"));
  await fs.writeFile(
    path.join(root, "qa/render-result.json"),
    JSON.stringify(
      {
        durationInFrames: composition.durationInFrames,
        fps: composition.fps,
        width: composition.width * renderScale,
        height: composition.height * renderScale,
        designWidth: composition.width,
        designHeight: composition.height,
        elapsedSeconds: (Date.now() - start) / 1000,
        bytes: stat.size,
        codec: "h264",
        audioCodec: "aac",
        crf: renderCrf,
        scale: renderScale,
        frameCaptureFormat: "png",
        x264Preset: "slow",
        colorSpace: "bt709",
      },
      null,
      2,
    ),
  );
  console.log("Rendered verified file exists: " + stat.size + " bytes");
}
