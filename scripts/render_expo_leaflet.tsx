/**
 * Render the Smart City Expo leaflet (English trifold) from the command line.
 *
 *   pnpm leaflet:expo [outPath]   (bundled with esbuild: @react-pdf/hyphenate is ESM-only, which tsx cannot require)
 *
 * Data comes from public/brochure/expo-data.json, written by the opencouncil.eu
 * repo (`node scripts/export-leaflet-data.mjs`) from its site snapshot.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToFile } from "@react-pdf/renderer";
import { ExpoLeafletPdf, type ExpoData } from "@/components/brochure/brochure-expo-pdf";

async function main() {
    const out = process.argv[2] ?? "expo-leaflet.pdf";
    const data = JSON.parse(readFileSync("public/brochure/expo-data.json", "utf8")) as ExpoData;
    await renderToFile(<ExpoLeafletPdf data={data} />, out);
    console.log(`wrote ${out}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
