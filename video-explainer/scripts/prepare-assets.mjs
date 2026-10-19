import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
await fs.mkdir(path.join(root, "public/assets"), { recursive: true });
await fs.copyFile(
  path.join(root, "../public/academic-seal-transparent.png"),
  path.join(root, "public/assets/academic-seal-transparent.png"),
);
for (const [file, url] of [
  [
    "Outfit.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/Outfit%5Bwght%5D.ttf",
  ],
  [
    "Nunito.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/Nunito%5Bwght%5D.ttf",
  ],
  [
    "Outfit-OFL.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt",
  ],
  [
    "Nunito-OFL.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt",
  ],
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  await fs.writeFile(
    path.join(root, "public/assets", file),
    Buffer.from(await response.arrayBuffer()),
  );
  console.log("Saved " + file);
}
