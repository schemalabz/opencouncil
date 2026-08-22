/**
 * Export one administrative body's meetings — subjects plus their existing
 * decision links as hidden ground truth — so matching can be scored against
 * them.
 *
 * The links never reach the matcher: the eval CLI strips them and asks the
 * pipeline's own matching core to re-derive them, then counts how often the
 * known ADA is recovered (recall) and how often a proposal is right
 * (precision).
 *
 * Pipeline:
 *   1. this script                                    -> matching-eval.json
 *   2. opencouncil-tasks `evaluate-decision-matching` -> recall + precision
 *
 * Read-only.
 *
 * Usage:
 *   npx tsx scripts/export-matching-eval.ts --body <administrativeBodyId>
 *   npx tsx scripts/export-matching-eval.ts --body <id> --out /tmp/eval.json
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
    return { body, out: get("--out") ?? "matching-eval.json" };
}

/** The document prints a local calendar date; CouncilMeeting.dateTime is UTC. */
function localDate(d: Date, timeZone: string): string {
    return d.toLocaleDateString("en-CA", { timeZone });
}

async function main() {
    const { body: bodyId, out } = parseArgs();

    const body = await prisma.administrativeBody.findUnique({
        where: { id: bodyId },
        select: {
            id: true, name: true, cityId: true, diavgeiaUnitIds: true,
            city: { select: { diavgeiaUid: true, timezone: true } },
        },
    });
    if (!body) throw new Error(`Administrative body "${bodyId}" not found`);
    if (!body.city.diavgeiaUid) throw new Error(`City "${body.cityId}" has no diavgeiaUid`);

    const meetings = await prisma.councilMeeting.findMany({
        where: { administrativeBodyId: bodyId },
        orderBy: { dateTime: "desc" },
        select: {
            id: true,
            dateTime: true,
            subjects: {
                select: {
                    id: true,
                    name: true,
                    agendaItemIndex: true,
                    nonAgendaReason: true,
                    decision: { select: { ada: true } },
                },
            },
        },
    });

    const exported = meetings
        .filter((m) => m.subjects.some((s) => s.decision?.ada))
        .map((m) => ({
            meetingId: m.id,
            meetingDate: localDate(m.dateTime, body.city.timezone),
            subjects: m.subjects.map((s) => ({
                subjectId: s.id,
                name: s.name,
                agendaItemIndex: s.agendaItemIndex,
                nonAgendaReason: s.nonAgendaReason ?? null,
                truthAda: s.decision?.ada ?? null,
            })),
        }));

    fs.writeFileSync(
        out,
        JSON.stringify(
            {
                city: body.cityId,
                administrativeBody: { id: body.id, name: body.name },
                diavgeiaUid: body.city.diavgeiaUid,
                diavgeiaUnitIds: body.diavgeiaUnitIds,
                meetings: exported,
            },
            null,
            2,
        ),
    );

    const truthCount = exported.reduce((n, m) => n + m.subjects.filter((s) => s.truthAda).length, 0);
    console.log(`Exported ${body.cityId} / ${body.name} -> ${out}`);
    console.log(`  meetings with links: ${exported.length}, linked subjects: ${truthCount}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
