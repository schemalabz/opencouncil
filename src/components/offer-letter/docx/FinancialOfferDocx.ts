/**
 * Οικονομική Προσφορά — .docx generator.
 *
 * The formal financial offer submitted to a municipality's procurement file:
 * company letterhead on every page, project/CPV/μελέτη/πρωτόκολλο intro
 * block, the total in Greek words + figures (πλέον and συμπεριλαμβανομένου
 * ΦΠΑ), the cost table, and the legal-representative signature.
 *
 * Project parameters (όνομα έργου, αριθμός μελέτης, αριθμός πρωτοκόλλου,
 * CPV) come from the user via the documents dialog.
 */
import { Document, PageBreak, Packer, Paragraph, TextRun } from "docx";
import type { Offer } from "@prisma/client";
import { getOfferProcurementLines, type ProcurementLine } from "@/lib/offers/display";
import { euroAmountInWords } from "@/lib/formatters/currencyWords";
import {
    body,
    buildDocTitle,
    buildLetterheadHeader,
    buildPageFooter,
    buildProcurementIntro,
    buildSignature,
    eur,
    getLogoData,
    SIZE,
    type ProcurementDocParams,
} from "./shared";
import { buildBudgetTable, DOC_NUMBERING, DOC_STYLES } from "./TechnicalDescriptionDocx";

const FINANCIAL_LABELS: Record<ProcurementLine["key"], string> = {
    presence: "Μαγνητοσκόπηση και ζωντανή μετάδοση συνεδριάσεων",
    equipment: "Παροχή εξοπλισμού μαγνητοσκόπησης / ζωντανής μετάδοσης συνεδριάσεων Δ.Σ.",
    ingestion: "Ψηφιοποίηση συνεδριάσεων Δ.Ε. & Δ.Σ.",
    platform: "Καταχώρηση σε διαδικτυακή πλατφόρμα ταξινομημένων δεδομένων συνεδριάσεων",
    correctness: "Έλεγχος απομαγνητοφωνήσεων από άνθρωπο",
};

export async function buildFinancialOfferDoc(
    offer: Offer,
    params: ProcurementDocParams
): Promise<Document> {
    const logo = await getLogoData();
    const lines = getOfferProcurementLines(offer);
    const { table, subtotal, totalWithVat } = buildBudgetTable(lines, FINANCIAL_LABELS, {
        includePilotRow: false,
    });

    const totalSentence = new Paragraph({
        spacing: { before: 240, after: 240 },
        children: [
            new TextRun({
                text: "Το συνολικό τίμημα για την εκτέλεση της ως άνω υπηρεσίας ανέρχεται σε ",
                size: SIZE.BODY,
            }),
            new TextRun({
                text: `${euroAmountInWords(subtotal)} (${eur(subtotal)}) πλέον ΦΠΑ`,
                size: SIZE.BODY,
                bold: true,
            }),
            new TextRun({ text: ", ήτοι ", size: SIZE.BODY }),
            new TextRun({
                text: `${euroAmountInWords(totalWithVat)} (${eur(totalWithVat)}) συμπεριλαμβανομένου ΦΠΑ`,
                size: SIZE.BODY,
                bold: true,
            }),
            new TextRun({ text: ". Αυτή η τιμή προκύπτει ως εξής:", size: SIZE.BODY }),
        ],
    });

    return new Document({
        creator: "OpenCouncil",
        title: `Οικονομική Προσφορά — ${offer.recipientName}`,
        numbering: DOC_NUMBERING,
        styles: DOC_STYLES,
        sections: [
            {
                properties: {},
                headers: { default: buildLetterheadHeader() },
                footers: { default: buildPageFooter() },
                children: [
                    ...buildDocTitle(logo, "ΟΙΚΟΝΟΜΙΚΗ ΠΡΟΣΦΟΡΑ"),
                    ...buildProcurementIntro(offer, params, "οικονομική"),
                    totalSentence,
                    new Paragraph({ children: [new PageBreak()] }),
                    table,
                    ...buildSignature(),
                ],
            },
        ],
    });
}

/** Generate the document and trigger a browser download. */
export async function downloadFinancialOffer(
    offer: Offer,
    params: ProcurementDocParams
): Promise<void> {
    const doc = await buildFinancialOfferDoc(offer, params);
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Οικονομική Προσφορά - ${offer.recipientName}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
