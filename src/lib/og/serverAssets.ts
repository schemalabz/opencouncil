// Server-only logo asset module.
//
// Lifts the `fs.readFileSync` of public/logo.png + public/white-logo.png out of
// `src/components/og/shared-components.tsx` so that file is safe to import from
// client code. This module must NEVER be imported from a "use client" component
// or any code path bundled to the browser — fs/path are Node-only.
//
// The data URIs are read once at module init and reused across renders.
import fs from "fs";
import path from "path";

function loadLogoAsDataUri(filename: string): string {
    try {
        const buf = fs.readFileSync(path.join(process.cwd(), "public", filename));
        return `data:image/png;base64,${buf.toString("base64")}`;
    } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        return "";
    }
}

export const LOGO_BLACK_DATA_URI = loadLogoAsDataUri("logo.png");
export const LOGO_WHITE_DATA_URI = loadLogoAsDataUri("white-logo.png");

/**
 * Fonts for the satori renderer.
 *
 * Relative Book Pro is the site's typeface (`packages/ui/tailwind-preset.ts`),
 * so the images set their text in it, and in its one weight: size and colour
 * carry the hierarchy, as they do on the pages. It covers Greek and Latin.
 * Inter follows it for the glyphs it lacks — Cyrillic for opencouncil.rs —
 * because satori falls through the list for a missing glyph.
 *
 * Given no `fonts`, `@vercel/og` would render with its bundled Geist and fetch
 * a Noto Sans subset from Google Fonts for each code point Geist misses, and
 * Geist draws ω as a capital Ω. Pinning the fonts settles the glyphs and drops
 * a network fetch from each render. Emoji are unaffected: `@vercel/og`
 * resolves those through its own asset loader rather than through these fonts.
 */
function font(file: string, name: string, weight: 400 | 500 | 600 | 700) {
    return { name, data: fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', 'pdf', file)), weight, style: 'normal' as const };
}

export const OG_FONT_FAMILY = 'Relative Book Pro';

export const OG_FONTS = [
    font('relative-pro-book.ttf', OG_FONT_FAMILY, 400),
    font('inter-400.ttf', 'Inter', 400),
    font('inter-500.ttf', 'Inter', 500),
    font('inter-600.ttf', 'Inter', 600),
    font('inter-700.ttf', 'Inter', 700),
];
