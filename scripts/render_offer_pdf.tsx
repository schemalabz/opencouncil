/**
 * Render an offer PDF from the command line — fast verify loop for iterating
 * on src/components/offer-letter/offer-pdf.tsx without clicking through the
 * browser.
 *
 * Usage:
 *   npx tsx scripts/render_offer_pdf.tsx [offerId] [outPath]
 *
 * Defaults: the most recent signed offer for chania, writing ./offer-test.pdf.
 * Preview the pages with e.g.: pdftoppm -r 80 -jpeg offer-test.pdf page
 */
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";
import { OfferPdfDocument } from "@/components/offer-letter/offer-pdf";

async function main() {
    const prisma = new PrismaClient();
    const offerId = process.argv[2];
    const out = process.argv[3] || "offer-test.pdf";

    const offer = offerId
        ? await prisma.offer.findUnique({ where: { id: offerId } })
        : await prisma.offer.findFirst({
              where: { cityId: "chania", agreed: true },
              orderBy: { createdAt: "desc" },
          });
    if (!offer) throw new Error("No offer found");

    console.log(`Rendering offer ${offer.id} (${offer.recipientName})`);
    await renderToFile(
        <OfferPdfDocument offer={offer} baseUrl="https://opencouncil.gr" />,
        out
    );
    console.log(`Wrote ${out}`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
