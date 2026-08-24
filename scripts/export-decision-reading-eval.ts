/**
 * Export one administrative body's already-linked decisions so model reading
 * can be scored against them.
 *
 * Existing links are free labelled data: each one asserts that a decision
 * belongs to a particular meeting. If we then read the decision and it names a
 * different session, either the reading or the link is wrong — and both are
 * worth knowing.
 *
 * Pipeline:
 *   1. this script                                   -> reading-eval.json
 *   2. opencouncil-tasks `evaluate-decision-reading` -> coverage + agreement
 *
 * Read-only.
 *
 * Usage:
 *   npx tsx scripts/export-decision-reading-eval.ts --body <administrativeBodyId>
 *   npx tsx scripts/export-decision-reading-eval.ts --body <id> --out /tmp/eval.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

function parseArgs() {
    const argv = process.argv.slice(2);
    const get = (flag: string) => {
        const i = argv.indexOf(flag);
        return i === -1 ? undefined : argv[i + 1];
    };
    const body = get("--body");
    if (!body) throw new Error("--body <administrativeBodyId> is required");
    return { body, out: get("--out") ?? "reading-eval.json" };
}

/**
 * The document prints a local calendar date; CouncilMeeting.dateTime is UTC.
 * A 22:00Z meeting is the next day in Athens, which is the date printed.
 */
function athensDate(d: Date): string {
    return d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

async function main() {
    const { body: bodyId, out } = parseArgs();

    const body = await prisma.administrativeBody.findUnique({
        where: { id: bodyId },
        select: { id: true, name: true, cityId: true },
    });
    if (!body) throw new Error(`Administrative body "${bodyId}" not found`);

    const meetings = await prisma.councilMeeting.findMany({
        where: { administrativeBodyId: bodyId },
        select: {
            dateTime: true,
            subjects: {
                where: { decision: { isNot: null } },
                select: { decision: { select: { ada: true, pdfUrl: true } } },
            },
        },
    });

    const decisions = meetings.flatMap((m) =>
        m.subjects
            .filter((s) => s.decision?.ada)
            .map((s) => ({
                ada: s.decision!.ada!,
                pdfUrl: s.decision!.pdfUrl,
                expectedMeetingDate: athensDate(m.dateTime),
            })),
    );

    fs.writeFileSync(
        out,
        JSON.stringify(
            {
                city: body.cityId,
                administrativeBody: { id: body.id, name: body.name },
                decisions,
            },
            null,
            2,
        ),
    );

    console.log(`Exported ${body.cityId} / ${body.name} -> ${out}`);
    console.log(`  linked decisions: ${decisions.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
