import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");

const svgIcon = String.raw`<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="112" y1="84" x2="912" y2="940" gradientUnits="userSpaceOnUse">
      <stop stop-color="#17364A"/>
      <stop offset="1" stop-color="#0C1824"/>
    </linearGradient>
    <linearGradient id="panel" x1="180" y1="160" x2="844" y2="522" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FAF7F0"/>
      <stop offset="1" stop-color="#EBE4D7"/>
    </linearGradient>
  </defs>

  <rect x="72" y="72" width="880" height="880" rx="220" fill="url(#bg)"/>
  <rect x="122" y="122" width="780" height="436" rx="96" fill="url(#panel)"/>

  <path d="M218 236H806" stroke="#D4C9B8" stroke-width="14" stroke-linecap="round" opacity="0.95"/>
  <path d="M218 302H806" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M218 368H806" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M218 434H806" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M382 190V492" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M562 190V492" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M694 190V492" stroke="#D4C9B8" stroke-width="10" stroke-linecap="round" opacity="0.7"/>

  <circle cx="526" cy="253" r="38" fill="#44C26F"/>
  <circle cx="640" cy="253" r="38" fill="#FFB323"/>
  <circle cx="754" cy="253" r="38" fill="#E3564C"/>

  <path d="M204 360H274L310 258L336 408L370 338L408 360H474" stroke="#17364A" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M548 458C588 444 630 394 656 312C673 258 700 238 732 247C764 256 788 295 824 334" stroke="#17364A" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>

  <text x="512" y="812" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="332" font-weight="900" fill="#FAF7F0">RB</text>
  <text x="512" y="900" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="74" font-weight="700" fill="#C9D7E2" letter-spacing="16">ROOMBOARD</text>
</svg>`;

async function main() {
  await mkdir(buildDir, { recursive: true });

  const svgPath = path.join(buildDir, "icon.svg");
  const pngPath = path.join(buildDir, "icon.png");
  const icoPath = path.join(buildDir, "icon.ico");

  await writeFile(svgPath, svgIcon, "utf8");

  const basePngBuffer = await sharp(Buffer.from(svgIcon))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  await writeFile(pngPath, basePngBuffer);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(basePngBuffer)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = await pngToIco(icoBuffers);
  await writeFile(icoPath, icoBuffer);
}

main()
  .then(() => {
    sharp.cache(false);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to generate desktop assets:", error);
    process.exit(1);
  });
