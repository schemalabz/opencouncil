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
 * Given no `fonts`, `@vercel/og` renders with its bundled Geist and fetches a
 * Noto Sans subset from Google Fonts for each code point Geist misses. Geist
 * carries a few Greek code points without carrying the Greek alphabet: it has
 * U+03C9 (ω) — drawn as a capital Ω, the way a Latin font ships an ohm sign —
 * but not α, τ or ώ. Which font wins for ω then depends on how the runtime
 * splits the text into runs, so the same string renders "των" in one
 * environment and "τΩν" in another. A PR preview showed the second.
 *
 * Pinning a font that covers every script we publish in — Greek, Cyrillic for
 * opencouncil.rs, Latin for opencouncil.fr — settles the glyphs and drops a
 * network fetch from each render. Inter is the site's own UI typeface
 * (`src/lib/fonts.ts`) and already ships in the repo for the PDF renderer, so
 * the images now match the pages they unfurl.
 *
 * Emoji are unaffected: `@vercel/og` resolves those through its own asset
 * loader rather than through these fonts.
 */
const INTER_WEIGHTS = [400, 500, 600, 700] as const;

export const OG_FONTS = INTER_WEIGHTS.map(weight => ({
    name: 'Inter',
    data: fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', 'pdf', `inter-${weight}.ttf`)),
    weight,
    style: 'normal' as const,
}));
