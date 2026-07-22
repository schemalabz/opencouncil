/**
 * Τεχνική Προσφορά — .docx generator.
 *
 * The formal technical offer submitted alongside the Οικονομική Προσφορά:
 * same letterhead and intro block, a reference to the μελέτη it complies
 * with, then the full technical sections (shared with the Πρότυπο τεχνικής
 * περιγραφής) and the legal-representative signature. Pricing is deferred
 * to the financial offer.
 */
import { Document, Packer } from "docx";
import type { Offer } from "@prisma/client";
import { downloadBlob } from "@/lib/utils/download";
import {
    body,
    buildDocTitle,
    buildLetterheadHeader,
    buildPageFooter,
    buildProcurementIntro,
    buildSignature,
    getLogoData,
    type ProcurementDocParams,
} from "./shared";
import {
    buildTechnicalSectionChildren,
    DOC_NUMBERING,
    DOC_STYLES,
} from "./TechnicalDescriptionDocx";

export async function buildTechnicalOfferDoc(
    offer: Offer,
    params: ProcurementDocParams
): Promise<Document> {
    const logo = await getLogoData();

    return new Document({
        creator: "OpenCouncil",
        title: `Τεχνική Προσφορά — ${offer.recipientName}`,
        numbering: DOC_NUMBERING,
        styles: DOC_STYLES,
        sections: [
            {
                properties: {},
                headers: { default: buildLetterheadHeader() },
                footers: { default: buildPageFooter() },
                children: [
                    ...buildDocTitle(logo, "ΤΕΧΝΙΚΗ ΠΡΟΣΦΟΡΑ"),
                    ...buildProcurementIntro(offer, params, "τεχνική"),
                    body(
                        `Αυτή η τεχνική προσφορά είναι σύμφωνη με τις τεχνικές προδιαγραφές της υπ' αριθμ. ${params.studyNumber} μελέτης, και τιμολογείται από την εταιρεία στην οικονομική προσφορά που υποβάλλεται σε ξεχωριστό έγγραφο.`
                    ),
                    ...buildTechnicalSectionChildren(offer),
                    ...buildSignature(),
                ],
            },
        ],
    });
}

/** Generate the document and trigger a browser download. */
export async function downloadTechnicalOffer(
    offer: Offer,
    params: ProcurementDocParams
): Promise<void> {
    const doc = await buildTechnicalOfferDoc(offer, params);
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `Τεχνική Προσφορά - ${offer.recipientName}.docx`);
}
