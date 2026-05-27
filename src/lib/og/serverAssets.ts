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
