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
    Footer,
    Header,
    HeadingLevel,
    ImageRun,
    PageNumber,
    Paragraph,
    TextRun,
} from "docx";
import type { Offer } from "@prisma/client";
import { offerGrammar } from "@/lib/offers/display";

// ─── Typography (half-points) ───────────────────────────────────────────────

export const SIZE = {
    COVER_TITLE: 40, // 20pt
    COVER_SUB: 32, // 16pt
    TITLE: 36, // 18pt
    BODY: 22, // 11pt
    SMALL: 20, // 10pt
    LETTERHEAD: 16, // 8pt
};

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
