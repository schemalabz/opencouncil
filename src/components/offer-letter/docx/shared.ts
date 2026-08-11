/**
 * Shared building blocks for offer .docx documents: text primitives, the
 * company letterhead (header/footer/logo/title), and the procurement intro
 * block used by Οικονομική and Τεχνική Προσφορά.
 *
 * Generators run both in the browser (lazy-loaded from the documents
 * dropdown) and in Node (scripts/render_offer_docx.tsx) — asset loading
 * resolves accordingly.
 */
import {
    AlignmentType,
    Document,
    Footer,
    Header,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    PageNumber,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
} from "docx";
import type { Offer } from "@prisma/client";
import { offerGrammar, type ProcurementLine } from "@/lib/offers/display";

// ─── Typography ─────────────────────────────────────────────────────────────

/**
 * Declared on the document defaults and on every heading style, so no host
 * default leaks in. A .docx that names no font renders in whatever each app
 * considers default — Word's theme font, Pages' Helvetica, Google Docs' Arial
 * — and, worse, the apps' built-in Heading styles then supply their own family
 * (and italics), so headings and body text diverge outside Word. Arial ships
 * with Windows, macOS and Google Docs and covers Greek, so it renders the same
 * everywhere. The budget-table column widths below are measured against it.
 */
export const FONT = "Arial";

/** Run sizes, in half-points. */
export const SIZE = {
    COVER_TITLE: 40, // 20pt
    COVER_SUB: 32, // 16pt
    TITLE: 36, // 18pt
    BODY: 22, // 11pt
    SMALL: 20, // 10pt
    LETTERHEAD: 16, // 8pt
};

// ─── Page geometry (twips) ──────────────────────────────────────────────────

// Pinned rather than left to the library defaults, so the budget-table column
// widths are known to add up to the text column: A4 minus one-inch margins.
export const PAGE_WIDTH = 11906;
export const PAGE_HEIGHT = 16838;
export const PAGE_MARGIN = 1440;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

// ─── Text primitives ────────────────────────────────────────────────────────

export const body = (text: string, opts: { bold?: boolean } = {}) =>
    new Paragraph({
        children: [new TextRun({ text, size: SIZE.BODY, bold: opts.bold })],
        spacing: { after: 120 },
    });

export const bullet = (text: string) =>
    new Paragraph({
        children: [new TextRun({ text, size: SIZE.BODY })],
        numbering: { reference: "tech-bullets", level: 0 },
        spacing: { after: 60 },
    });

export const h1 = (text: string) =>
    new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text })],
        spacing: { before: 360, after: 180 },
    });

export const h2 = (text: string) =>
    new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text })],
        spacing: { before: 300, after: 150 },
    });

export const h3 = (text: string) =>
    new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text })],
        spacing: { before: 240, after: 120 },
    });

export const eur = (n: number) =>
    `${n.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Assets ─────────────────────────────────────────────────────────────────

/** Logo bytes — fetch in the browser, filesystem in Node. */
export async function getLogoData(): Promise<Uint8Array> {
    if (typeof window !== "undefined") {
        const res = await fetch("/logo.png");
        return new Uint8Array(await res.arrayBuffer());
    }
    const { readFile } = await import(/* webpackIgnore: true */ "fs/promises");
    return new Uint8Array(await readFile(`${process.cwd()}/public/logo.png`));
}

// Logo intrinsic ratio 1606 × 1354 → render at 44 × 37 px
export const LOGO_W = 44;
export const LOGO_H = Math.round((LOGO_W * 1354) / 1606);

// ─── Letterhead ─────────────────────────────────────────────────────────────

/** "Τρίτη, 21 Ιουλίου 2026" */
function greekLetterheadDate(d: Date = new Date()): string {
    const weekday = new Intl.DateTimeFormat("el-GR", { weekday: "long" }).format(d);
    const rest = new Intl.DateTimeFormat("el-GR", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(d);
    return `${weekday}, ${rest}`;
}

const letterheadLine = (text: string) =>
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text, size: SIZE.LETTERHEAD, color: "444444" })],
    });

/** Company letterhead shown at the top of every page. */
export function buildLetterheadHeader(): Header {
    return new Header({
        children: [
            letterheadLine("OpenCouncil Μονοπρόσωπη Ι.Κ.Ε. – Λαλέχου 1, Νέο Ψυχικό 15451"),
            letterheadLine("+30 2111980212 – hello@opencouncil.gr"),
            letterheadLine(greekLetterheadDate()),
        ],
    });
}

/** "Σελίδα N" centered at the bottom of every page. */
export function buildPageFooter(): Footer {
    return new Footer({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "Σελίδα ", size: SIZE.LETTERHEAD, color: "444444" }),
                    new TextRun({
                        children: [PageNumber.CURRENT],
                        size: SIZE.LETTERHEAD,
                        color: "444444",
                    }),
                ],
            }),
        ],
    });
}

/** Centered logo + wordmark, then the document title in caps. */
export function buildDocTitle(logoData: Uint8Array, title: string): Paragraph[] {
    return [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [
                new ImageRun({
                    type: "png",
                    data: logoData,
                    transformation: { width: LOGO_W, height: LOGO_H },
                }),
                new TextRun({ text: "  OpenCouncil", size: SIZE.TITLE }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: title, size: SIZE.TITLE })],
        }),
    ];
}

// ─── Procurement intro block ────────────────────────────────────────────────

export type ProcurementDocParams = {
    /** e.g. «ΜΑΓΝΗΤΟΣΚΟΠΗΣΗ, ΑΠΟΜΑΓΝΗΤΟΦΩΝΗΣΗ ΚΑΙ ΚΑΤΑΧΩΡΗΣΗ …» */
    projectName: string;
    /** e.g. "93/2025" */
    studyNumber: string;
    /** e.g. "22201" */
    protocolNumber: string;
    /** e.g. "72400000-4 (Υπηρεσίες διαδικτύου)" */
    cpv: string;
};

/** "Δήμο Χανίων" → "Δήμου Χανίων", "Περιφέρεια Αττικής" → "Περιφέρειας Αττικής" */
export function recipientGenitive(recipientName: string): string {
    if (recipientName.startsWith("Δήμο ")) return recipientName.replace(/^Δήμο /, "Δήμου ");
    if (recipientName.startsWith("Περιφέρεια "))
        return recipientName.replace(/^Περιφέρεια /, "Περιφέρειας ");
    return recipientName;
}

/**
 * The intro block common to Οικονομική and Τεχνική Προσφορά: the centered
 * bold summary (εταιρεία → δήμος → έργο → CPV → μελέτη), the company
 * identification paragraph, and the πρόσκληση reference.
 */
export function buildProcurementIntro(
    offer: Offer,
    params: ProcurementDocParams,
    docKindLabel: "οικονομική" | "τεχνική"
): Paragraph[] {
    const G = offerGrammar(offer);
    const genitive = recipientGenitive(offer.recipientName);

    return [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
                new TextRun({ text: "Της εταιρείας ", size: SIZE.BODY, italics: true }),
                new TextRun({
                    text: "OpenCouncil Μονοπρόσωπη ΙΚΕ",
                    size: SIZE.BODY,
                    bold: true,
                    italics: true,
                }),
                new TextRun({ text: ` προς ${G.accusative} `, size: SIZE.BODY, italics: true }),
                new TextRun({
                    text: offer.recipientName,
                    size: SIZE.BODY,
                    bold: true,
                    italics: true,
                }),
                new TextRun({ text: " για το έργο ", size: SIZE.BODY, italics: true }),
                new TextRun({
                    text: `«${params.projectName}»`,
                    size: SIZE.BODY,
                    bold: true,
                    italics: true,
                }),
                new TextRun({
                    text: ` (CPV: ${params.cpv}) που περιγράφεται στη `,
                    size: SIZE.BODY,
                    italics: true,
                }),
                new TextRun({
                    text: `μελέτη υπ' αριθμ. ${params.studyNumber}`,
                    size: SIZE.BODY,
                    bold: true,
                    italics: true,
                }),
                new TextRun({ text: ".", size: SIZE.BODY, italics: true }),
            ],
        }),
        body(
            `Η OpenCouncil Μονοπρόσωπη Ι.Κ.Ε. (Αριθμός ΓΕΜΗ: 180529301000, ΑΦΜ: 802666391, Έδρα: Λαλέχου 1, Νέο Ψυχικό 15451) υποβάλλει την παρούσα ${docKindLabel} προσφορά στη Διεύθυνση Οικονομικών Υπηρεσιών του ${genitive}.`
        ),
        body(
            `Η προσφορά αφορά τη σύναψη σύμβασης για την «${params.projectName}» και αποτελεί απάντηση στην πρόσκληση ${G.possessive === "της περιφέρειας" ? "της περιφέρειας" : "του δήμου"} με Αριθμό Πρωτοκόλλου ${params.protocolNumber}.`
        ),
    ];
}

/** Right-aligned signature block. */
export function buildSignature(): Paragraph[] {
    const line = (text: string, bold = false) =>
        new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 60 },
            children: [new TextRun({ text, size: SIZE.BODY, bold })],
        });
    return [
        new Paragraph({ spacing: { before: 480 }, children: [] }),
        line("για την OpenCouncil Μονοπρόσωπη Ι.Κ.Ε."),
        line("ο νόμιμος εκπρόσωπος"),
        line("Χρήστος Πόριος", true),
    ];
}

// ─── Budget table (shared by Τεχνική Περιγραφή and Οικονομική Προσφορά) ─────

const VAT_RATE = 0.24;

/**
 * Column widths in DXA, summing to CONTENT_WIDTH.
 *
 * Word autofits tables and quietly widens columns to fit their content; Pages
 * and Google Docs lay them out from the declared grid, so anything that
 * doesn't fit wraps — the "Ποσότητα" header split mid-word and the euro
 * amounts broke onto a second line there. Each width is at least the widest
 * unbreakable token in its column (measured in Arial 10pt) plus the cell
 * margins, so no cell breaks a word on any renderer. Keep them in sync with
 * SIZE.SMALL, CELL_MARGIN and the longest labels if any of those change.
 */
const COL_WIDTHS = [2246, 1420, 1070, 1020, 1130, 1010, 1130];
const TABLE_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0);

// Horizontal padding inside every budget-table cell, in DXA. Deducted from the
// column widths above when checking that content fits.
const CELL_MARGIN = 60;

function cell(
    text: string,
    opts: { bold?: boolean; header?: boolean; right?: boolean; width: number }
) {
    return new TableCell({
        width: { size: opts.width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: opts.header ? { type: ShadingType.CLEAR, fill: "F2F2F2" } : undefined,
        margins: { top: 60, bottom: 60, left: CELL_MARGIN, right: CELL_MARGIN },
        children: [
            new Paragraph({
                alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [
                    new TextRun({ text, size: SIZE.SMALL, bold: opts.bold || opts.header }),
                ],
            }),
        ],
    });
}

/** Budget table with ΦΠΑ columns, shared column model with Οικονομική. */
/**
 * Budget table for procurement documents.
 *
 * Per-line figures are presentational: unit prices are shown post-discount,
 * rounded to the cent, and each row multiplies out. The Σύνολα row, however,
 * comes from `subtotal` — pass `calculateOfferTotals(offer).total` — so the
 * legally-binding totals always equal the negotiated amount on the offer
 * letter to the cent, even when discounted unit prices don't round exactly
 * (per-line double-rounding can otherwise drift by cents).
 */
export function buildBudgetTable(
    lines: ProcurementLine[],
    labels: Record<ProcurementLine["key"], string>,
    opts: { includePilotRow?: boolean; subtotal: number }
): {
    table: Table;
    subtotal: number;
    vat: number;
    totalWithVat: number;
} {
    const { includePilotRow = true, subtotal: authoritativeSubtotal } = opts;
    const headers = ["Είδος", "Μονάδα", "Ποσότητα", "Κόστος", "Σύνολο", "ΦΠΑ 24%", "Σύνολο με ΦΠΑ"];
    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map((t, i) =>
            cell(t, { header: true, width: COL_WIDTHS[i], right: i >= 2 })
        ),
    });

    const dataRows = lines.map((line) => {
        const vat = round2(line.total * VAT_RATE);
        return new TableRow({
            children: [
                cell(labels[line.key], { width: COL_WIDTHS[0] }),
                cell(line.unitLabel, { width: COL_WIDTHS[1] }),
                cell(String(line.qty), { width: COL_WIDTHS[2], right: true }),
                cell(eur(line.unitPrice), { width: COL_WIDTHS[3], right: true }),
                cell(eur(line.total), { width: COL_WIDTHS[4], right: true }),
                cell(eur(vat), { width: COL_WIDTHS[5], right: true }),
                cell(eur(round2(line.total + vat)), { width: COL_WIDTHS[6], right: true }),
            ],
        });
    });

    // Pilot features row — always €0, signals they're bundled.
    const pilotRow = new TableRow({
        children: [
            cell("Πιλοτικές λειτουργίες, επιπλέον προδιαγραφές και υπηρεσίες", {
                width: COL_WIDTHS[0],
            }),
            cell("Όπως περιγράφονται", { width: COL_WIDTHS[1] }),
            cell("—", { width: COL_WIDTHS[2], right: true }),
            cell("—", { width: COL_WIDTHS[3], right: true }),
            cell(eur(0), { width: COL_WIDTHS[4], right: true }),
            cell(eur(0), { width: COL_WIDTHS[5], right: true }),
            cell(eur(0), { width: COL_WIDTHS[6], right: true }),
        ],
    });

    const subtotal = round2(authoritativeSubtotal);
    const vatTotal = round2(subtotal * VAT_RATE);
    const totalWithVat = round2(subtotal + vatTotal);
    const totalRow = new TableRow({
        children: [
            cell("Σύνολα", { bold: true, width: COL_WIDTHS[0] }),
            cell("", { width: COL_WIDTHS[1] }),
            cell("", { width: COL_WIDTHS[2] }),
            cell("", { width: COL_WIDTHS[3] }),
            cell(eur(subtotal), { bold: true, width: COL_WIDTHS[4], right: true }),
            cell(eur(vatTotal), { bold: true, width: COL_WIDTHS[5], right: true }),
            cell(eur(totalWithVat), { bold: true, width: COL_WIDTHS[6], right: true }),
        ],
    });

    return {
        table: new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: COL_WIDTHS,
            // Without a fixed layout Word re-autofits and the column widths
            // above stop describing what anyone sees.
            layout: TableLayoutType.FIXED,
            rows: [
                headerRow,
                ...dataRows,
                ...(includePilotRow ? [pilotRow] : []),
                totalRow,
            ],
        }),
        subtotal,
        vat: vatTotal,
        totalWithVat,
    };
}

// ─── Shared Document assembly options ───────────────────────────────────────

export const DOC_NUMBERING = {
    config: [
        {
            reference: "tech-bullets",
            levels: [
                {
                    level: 0,
                    format: LevelFormat.BULLET,
                    text: "•",
                    alignment: AlignmentType.LEFT,
                    style: {
                        paragraph: {
                            indent: { left: 504, hanging: 259 },
                        },
                    },
                },
            ],
        },
    ],
};

// Every heading style spells out italics and the font as well as weight and
// colour: these styles override the app's built-in Heading 1/2/3, and whatever
// they leave unset is inherited from it. Word's heading is blue Calibri Light,
// LibreOffice's is italic sans, Pages' is its own display face — so headings
// came out italic and in a different family than the body outside Word.
const heading = (size: number) => ({
    run: { size, bold: true, italics: false, color: "000000", font: FONT },
});

export const DOC_STYLES = {
    default: {
        document: { run: { size: SIZE.BODY, font: FONT } },
        heading1: heading(30),
        heading2: heading(26),
        heading3: heading(23),
    },
};

/**
 * Common Document envelope for the procurement .docx generators: OpenCouncil
 * metadata, shared numbering/styles, a single section, and optionally the
 * company letterhead header + page-number footer.
 */
export function procurementDocument(opts: {
    title: string;
    children: (Paragraph | Table)[];
    letterhead?: boolean;
}): Document {
    return new Document({
        creator: "OpenCouncil",
        title: opts.title,
        numbering: DOC_NUMBERING,
        styles: DOC_STYLES,
        sections: [
            {
                properties: {
                    page: {
                        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                        margin: {
                            top: PAGE_MARGIN,
                            right: PAGE_MARGIN,
                            bottom: PAGE_MARGIN,
                            left: PAGE_MARGIN,
                        },
                    },
                },
                ...(opts.letterhead
                    ? {
                          headers: { default: buildLetterheadHeader() },
                          footers: { default: buildPageFooter() },
                      }
                    : {}),
                children: opts.children,
            },
        ],
    });
}
