import path from "path";
import sharp from "sharp";
import { APPLE_SPLASH_SCREENS, appleSplashPath } from "../src/lib/pwa/splash";

// Renders the PWA icon set and the iOS startup images from the brand mark in
// public/logo.png. Run with
// `npm run generate-pwa-icons` after the mark changes; the output is committed
// because the manifest (src/app/manifest.ts) and the root layout link to
// these files by name.
//
// Two shapes of the same mark:
// - "any" icons keep the mark inside 80% of the tile, on white. Browsers show
//   them as they are.
// - "maskable" icons keep the mark inside the 40%-radius safe zone that the
//   W3C maskable spec guarantees, so Android launchers can cut the tile into
//   a circle or a squircle without clipping the mark.
const SOURCE = path.join(process.cwd(), "public", "logo.png");
const OUT_DIR = path.join(process.cwd(), "public", "icons");
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const ICONS: Array<{ file: string; size: number; markRatio: number }> = [
    { file: "icon-192.png", size: 192, markRatio: 0.8 },
    { file: "icon-512.png", size: 512, markRatio: 0.8 },
    { file: "icon-maskable-192.png", size: 192, markRatio: 0.55 },
    { file: "icon-maskable-512.png", size: 512, markRatio: 0.55 },
    // iOS applies its own rounded mask and never reads the manifest icons.
    { file: "apple-touch-icon.png", size: 180, markRatio: 0.7 },
];

async function render(mark: Buffer, size: number, markRatio: number): Promise<Buffer> {
    const markSize = Math.round(size * markRatio);
    const resized = await sharp(mark)
        .resize(markSize, markSize, { fit: "contain", background: { ...WHITE, alpha: 0 } })
        .png()
        .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
        .composite([{ input: resized, gravity: "centre" }])
        .png()
        .toBuffer();
}

// A startup image is the splash iOS shows while the app opens: the mark
// centred on white, sized to the device. The mark takes a quarter of the
// shorter side, which keeps it inside the notch and home-bar areas.
async function renderSplash(mark: Buffer, width: number, height: number): Promise<Buffer> {
    const markSize = Math.round(Math.min(width, height) * 0.25);
    const resized = await sharp(mark)
        .resize(markSize, markSize, { fit: "contain", background: { ...WHITE, alpha: 0 } })
        .png()
        .toBuffer();
    return sharp({ create: { width, height, channels: 4, background: WHITE } })
        .composite([{ input: resized, gravity: "centre" }])
        .png()
        .toBuffer();
}

async function main() {
    // logo.png carries wide transparent margins; trim them so markRatio
    // measures the mark itself, not the file.
    const mark = await sharp(SOURCE).trim().png().toBuffer();
    for (const { file, size, markRatio } of ICONS) {
        const out = path.join(OUT_DIR, file);
        await sharp(await render(mark, size, markRatio)).toFile(out);
        console.log(`wrote ${path.relative(process.cwd(), out)}`);
    }
    for (const screen of APPLE_SPLASH_SCREENS) {
        const out = path.join(process.cwd(), "public", appleSplashPath(screen));
        await sharp(await renderSplash(mark, screen.width * screen.ratio, screen.height * screen.ratio)).toFile(out);
        console.log(`wrote ${path.relative(process.cwd(), out)}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
