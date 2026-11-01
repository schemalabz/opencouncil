/**
 * Write the expo leaflet's copy to a Word file, one table per section, keyed so an
 * edited file maps back onto src/components/brochure/expo-leaflet-copy.ts.
 *
 *   npx tsx scripts/export_expo_copy.ts [outPath]
 */
import { writeFileSync } from "node:fs";
import {
    BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { EXPO_COPY, EXPO_COPY_SECTIONS } from "@/components/brochure/expo-leaflet-copy";

type Row = { key: string; text: string };

/** Flatten nested copy into "a.b.1.c" keys, lists numbered from 1. */
function flatten(value: unknown, prefix: string, out: Row[]): void {
    if (typeof value === "string") {
        out.push({ key: prefix, text: value });
    } else if (Array.isArray(value)) {
        value.forEach((item, i) => flatten(item, `${prefix}.${i + 1}`, out));
    } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
}

const FONT = "Arial";
const KEY_W = 2600;
const TEXT_W = 6760;
const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(children: Paragraph[], width: number, shaded = false): TableCell {
    return new TableCell({
        children,
        width: { size: width, type: WidthType.DXA },
        borders,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        shading: shaded ? { type: ShadingType.CLEAR, fill: "F3F3F3", color: "auto" } : undefined,
    });
}

function keyCell(key: string): TableCell {
    return cell([new Paragraph({ children: [new TextRun({ text: key, font: "Courier New", size: 16, color: "666666" })] })], KEY_W, true);
}

function textCell(text: string): TableCell {
    // A forced line break in the copy is its own paragraph here; the import joins them back with "\n".
    const paragraphs = text.split("\n").map(line => new Paragraph({ children: [new TextRun({ text: line, font: FONT, size: 20 })] }));
    return cell(paragraphs, TEXT_W);
}

function sectionTable(rows: Row[]): Table {
    return new Table({
        width: { size: KEY_W + TEXT_W, type: WidthType.DXA },
        columnWidths: [KEY_W, TEXT_W],
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    cell([new Paragraph({ children: [new TextRun({ text: "Key (do not edit)", font: FONT, size: 18, bold: true })] })], KEY_W, true),
                    cell([new Paragraph({ children: [new TextRun({ text: "Text", font: FONT, size: 18, bold: true })] })], TEXT_W, true),
                ],
            }),
            ...rows.map(row => new TableRow({ children: [keyCell(row.key), textCell(row.text)] })),
        ],
    });
}

function para(text: string, opts: { size?: number; color?: string; italics?: boolean; after?: number } = {}): Paragraph {
    return new Paragraph({
        spacing: { after: opts.after ?? 120 },
        children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, color: opts.color, italics: opts.italics })],
    });
}

function main() {
    const out = process.argv[2] ?? "expo-leaflet-copy.docx";
    const children: Array<Paragraph | Table> = [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "OpenCouncil expo leaflet: copy", font: FONT })] }),
        para(`Exported ${new Date().toISOString().slice(0, 10)} from expo-leaflet-copy.ts. Edit the Text column only; the Key column is how the text finds its place in the leaflet.`),
        para("Things in curly braces, such as {live}, {preview} or {date}, are filled in from the data when the leaflet is made: leave them where they are, or move them within the sentence. {accent} marks the part of a sentence that prints in orange; that part has its own row ending in \"Accent\".", { color: "444444" }),
        para("A line that must break in a given place (the three numbers on the cover) is split over two lines in its cell. Keep it as two lines.", { color: "444444", after: 240 }),
    ];
    for (const section of EXPO_COPY_SECTIONS) {
        const rows: Row[] = [];
        flatten(EXPO_COPY[section.key], section.key, rows);
        children.push(
            new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 60 }, children: [new TextRun({ text: section.title, font: FONT })] }),
            para(section.where, { size: 18, color: "666666", italics: true }),
            sectionTable(rows),
        );
    }
    const doc = new Document({
        creator: "OpenCouncil",
        title: "OpenCouncil expo leaflet: copy",
        styles: { default: { document: { run: { font: FONT, size: 20 } } } },
        sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
    });
    Packer.toBuffer(doc).then(buffer => {
        writeFileSync(out, buffer);
        console.log(`wrote ${out}`);
    });
}

main();
