/**
 * Read an edited copy of the Word file that `pnpm leaflet:expo:copy` wrote and apply the
 * changed rows to src/components/brochure/expo-leaflet-copy.ts, by key.
 *
 *   npx tsx scripts/import_expo_copy.ts edited.docx [--dry-run]
 *
 * Each changed string literal is replaced in place, so the file keeps its shape and
 * comments. Rows the file lacks, or keys the module lacks, are reported and skipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { EXPO_COPY } from "@/components/brochure/expo-leaflet-copy";

const MODULE = "src/components/brochure/expo-leaflet-copy.ts";

function flatten(value: unknown, prefix: string, out: Record<string, string>): void {
    if (typeof value === "string") out[prefix] = value;
    else if (Array.isArray(value)) value.forEach((item, i) => flatten(item, `${prefix}.${i + 1}`, out));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
}

function decodeXml(s: string): string {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** The text of one table cell: paragraphs joined with "\n", runs concatenated, deletions ignored. */
function cellText(cellXml: string): string {
    const paragraphs = cellXml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [];
    return paragraphs
        .map(p => {
            const withoutDeleted = p.replace(/<w:del[ >][\s\S]*?<\/w:del>/g, "");
            const parts = withoutDeleted.match(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>|<w:br\/>|<w:tab\/>/g) ?? [];
            return parts.map(part => (part === "<w:br/>" ? "\n" : part === "<w:tab/>" ? "\t" : decodeXml(part.replace(/<[^>]+>/g, "")))).join("");
        })
        .join("\n")
        .replace(/\s+$/g, "");
}

async function readRows(path: string): Promise<Record<string, string>> {
    const zip = await JSZip.loadAsync(readFileSync(path));
    const xml = await zip.file("word/document.xml")!.async("string");
    const rows: Record<string, string> = {};
    for (const tr of xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? [];
        if (cells.length < 2) continue;
        const key = cellText(cells[0]).trim();
        if (!key || key.startsWith("Key")) continue;
        rows[key] = cellText(cells[1]);
    }
    return rows;
}

async function main() {
    const [path, ...flags] = process.argv.slice(2);
    if (!path) throw new Error("usage: import_expo_copy.ts edited.docx [--dry-run]");
    const dryRun = flags.includes("--dry-run");
    const current: Record<string, string> = {};
    flatten(EXPO_COPY, "", current);
    const edited = await readRows(path);

    let source = readFileSync(MODULE, "utf8");
    let applied = 0;
    for (const [key, oldText] of Object.entries(current)) {
        if (!(key in edited)) {
            console.warn(`missing in file: ${key}`);
            continue;
        }
        const newText = edited[key];
        if (newText === oldText) continue;
        const oldLiteral = JSON.stringify(oldText);
        const count = source.split(oldLiteral).length - 1;
        if (count !== 1) {
            console.warn(`cannot place ${key}: the old text occurs ${count} times in ${MODULE}`);
            continue;
        }
        source = source.replace(oldLiteral, JSON.stringify(newText));
        applied += 1;
        console.log(`${key}\n  - ${oldText}\n  + ${newText}`);
    }
    for (const key of Object.keys(edited)) if (!(key in current)) console.warn(`unknown key in file: ${key}`);
    if (!dryRun && applied > 0) writeFileSync(MODULE, source);
    console.log(`${applied} change${applied === 1 ? "" : "s"}${dryRun ? " (dry run, nothing written)" : ` written to ${MODULE}`}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
