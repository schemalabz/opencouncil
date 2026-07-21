/**
 * Render an offer's .docx documents from the command line — fast verify
 * loop for iterating on the generators without the browser.
 *
 * Usage:
 *   npx tsx scripts/render_offer_docx.tsx [offerId] [outPath] [doc]
 *
 * doc: "description" (default) | "financial" | "technical"
 * Defaults: the most recent signed offer for chania, writing ./td-test.docx.
 * The financial/technical docs use sample project parameters.
 */
import { PrismaClient } from "@prisma/client";
import { Packer } from "docx";
import { writeFileSync } from "fs";
import { buildTechnicalDescriptionDoc } from "@/components/offer-letter/docx/TechnicalDescriptionDocx";
import { buildFinancialOfferDoc } from "@/components/offer-letter/docx/FinancialOfferDocx";
import { buildTechnicalOfferDoc } from "@/components/offer-letter/docx/TechnicalOfferDocx";
import { deriveOfferCpv } from "@/lib/offers/display";

async function main() {
    const prisma = new PrismaClient();
    const offerId = process.argv[2];
    const out = process.argv[3] || "td-test.docx";
    const kind = process.argv[4] || "description";

    const offer = offerId
        ? await prisma.offer.findUnique({ where: { id: offerId } })
        : await prisma.offer.findFirst({
              where: { cityId: "chania", agreed: true },
              orderBy: { createdAt: "desc" },
          });
    if (!offer) throw new Error("No offer found");

    const params = {
        projectName:
            "ΜΑΓΝΗΤΟΣΚΟΠΗΣΗ, ΑΠΟΜΑΓΝΗΤΟΦΩΝΗΣΗ ΚΑΙ ΚΑΤΑΧΩΡΗΣΗ ΣΤΟΙΧΕΙΩΝ ΣΥΝΕΔΡΙΑΣΕΩΝ ΣΥΛΛΟΓΙΚΩΝ ΟΡΓΑΝΩΝ ΕΤΟΥΣ 2026 ΣΕ ΔΙΑΔΙΚΤΥΑΚΗ ΠΛΑΤΦΟΡΜΑ",
        studyNumber: "93/2025",
        protocolNumber: "22201",
        cpv: deriveOfferCpv(offer),
    };

    const doc =
        kind === "financial"
            ? await buildFinancialOfferDoc(offer, params)
            : kind === "technical"
              ? await buildTechnicalOfferDoc(offer, params)
              : buildTechnicalDescriptionDoc(offer);
    const buf = await Packer.toBuffer(doc);
    writeFileSync(out, buf);
    console.log(`Wrote ${out} (${offer.recipientName}, ${kind})`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
