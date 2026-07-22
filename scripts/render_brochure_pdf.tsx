/**
 * Render the trifold brochure PDF from the command line — fast verify loop
 * for iterating on src/components/brochure/brochure-pdf.tsx.
 *
 * Usage:
 *   npx tsx scripts/render_brochure_pdf.tsx [outPath] [cityId]
 *
 * Pass a cityId (e.g. "chania") for the city variant handed to councilors.
 * Uses live stats from the database. Preview the pages with e.g.:
 *   pdftoppm -r 80 -jpeg brochure-test.pdf page
 */
import React from "react";
import { renderToFile } from "@react-pdf/renderer";
import { PrismaClient } from "@prisma/client";
import { BrochurePdf } from "@/components/brochure/brochure-pdf";
import { coveredBodyTypesByCity, toBrochurePartners } from "@/lib/brochure";
import { getCityCoverage } from "@/lib/db/coverage";

// Same queries as getAboutPageStats() in src/lib/db/cities.ts, on a plain
// PrismaClient — the lib module drags in Next.js-only imports under tsx.
async function fetchStats(prisma: PrismaClient) {
    const [municipalityCount, subjectCount, meetingDurations] = await Promise.all([
        prisma.city.count({ where: { officialSupport: true } }),
        prisma.subject.count({ where: { councilMeeting: { released: true } } }),
        prisma.$queryRaw<Array<{ total_hours: number }>>`
            SELECT COALESCE(SUM(meeting_hours), 0) as total_hours
            FROM (
                SELECT (MAX(ss."endTimestamp") - MIN(ss."startTimestamp")) / 3600.0 as meeting_hours
                FROM "CouncilMeeting" cm
                JOIN "SpeakerSegment" ss ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
                WHERE cm.released = true
                GROUP BY cm.id, cm."cityId"
            ) meetings
        `,
    ]);
    return {
        municipalityCount,
        subjectCount,
        meetingHours: Math.round(Number(meetingDurations[0]?.total_hours ?? 0)),
    };
}

async function main() {
    const out = process.argv[2] || "brochure-test.pdf";
    const cityId = process.argv[3];

    const prisma = new PrismaClient();
    const stats = await fetchStats(prisma);
    console.log("Stats:", stats);

    const supportedCities = await prisma.city.findMany({
        where: { officialSupport: true, status: "listed", logoImage: { not: null } },
        select: { logoImage: true, name_municipality: true },
        orderBy: { name: "asc" },
    });
    const partners = toBrochurePartners(supportedCities);
    console.log(`Partner logos: ${partners.length}/${supportedCities.length}`);

    let city;
    if (cityId) {
        const record = await prisma.city.findUnique({
            where: { id: cityId },
            select: { id: true, name_municipality: true },
        });
        if (!record) throw new Error(`City not found: ${cityId}`);

        // ΑΔΑΜ of the contract currently in effect, if any (endDate is stored
        // at midnight — the contract still runs on its final day).
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const contract = await prisma.offer.findFirst({
            where: {
                cityId,
                adam: { not: null },
                startDate: { lte: now },
                endDate: { gte: startOfToday },
            },
            orderBy: { startDate: "desc" },
            select: { adam: true },
        });

        // Same coverage source as /explain — body types with released meetings.
        const coverage = coveredBodyTypesByCity(await getCityCoverage("greece"));
        city = {
            id: record.id,
            nameMunicipality: record.name_municipality,
            adam: contract?.adam ?? undefined,
            coveredBodyTypes: coverage[record.id],
        };
        console.log(
            "City variant:", city.nameMunicipality,
            "ΑΔΑΜ:", city.adam ?? "—",
            "bodies:", (city.coveredBodyTypes ?? []).join(",") || "—"
        );
    }
    await prisma.$disconnect();

    await renderToFile(
        <BrochurePdf
            data={{
                stats,
                partners,
                baseUrl: "https://opencouncil.gr",
                contactEmail: "christos@opencouncil.gr",
                contactPhone: "+30 6980586851",
                city,
            }}
        />,
        out
    );
    console.log(`Wrote ${out}`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
