/**
 * Render an offer's Τεχνική Περιγραφή .docx from the command line — fast
 * verify loop for iterating on the generator without the browser.
 *
 * Usage:
 *   npx tsx scripts/render_offer_docx.tsx [offerId] [outPath]
 *
 * Defaults: the most recent signed offer for chania, writing ./td-test.docx.
 */
import { PrismaClient } from "@prisma/client";
import { Packer } from "docx";
import { writeFileSync } from "fs";
import { buildTechnicalDescriptionDoc } from "@/components/offer-letter/docx/TechnicalDescriptionDocx";

async function main() {
    const prisma = new PrismaClient();
    const offerId = process.argv[2];
    const out = process.argv[3] || "td-test.docx";

    const offer = offerId
        ? await prisma.offer.findUnique({ where: { id: offerId } })
        : await prisma.offer.findFirst({
              where: { cityId: "chania", agreed: true },
              orderBy: { createdAt: "desc" },
          });
    if (!offer) throw new Error("No offer found");

    const doc = buildTechnicalDescriptionDoc(offer);
    const buf = await Packer.toBuffer(doc);
    writeFileSync(out, buf);
    console.log(`Wrote ${out} (${offer.recipientName})`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
