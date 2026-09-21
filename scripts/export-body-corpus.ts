/**
 * Export a sample of every administrative body's linked decisions, so the
 * documents each body publishes can be profiled.
 *
 * Extraction assumed one document shape. Municipalities, and bodies within a
 * municipality, state the same facts differently: Athens keys attendance
 * changes to decision numbers, Sparta to clock times; Sparta's roll call is
 * cumulative while Orestiada leaves late arrivals in the absent list. Before
 * anything can be labelled or scored, we need to know what each body actually
 * states. Two documents per body cannot answer that — a property is invisible
 * whenever the sampled documents happen not to exercise it.
 *
 * The sample is stratified **by meeting, not by decision**. Every decision of
 * one session repeats that session's preamble — the same roll call, the same
 * arrivals and departures — so forty decisions drawn from six meetings is six
 * observations of attendance, not forty. A first version sampled decisions
 * directly and drew its entire Piraeus, Thessaloniki and Thira samples from a
 * single meeting each, then reported that those bodies never record an arrival.
 *
 * So: meetings are taken at a fixed stride across the body's date range, and
 * one decision is taken from each. Within a meeting the decision with the
 * highest agenda index is preferred, because by the last item the document has
 * seen every arrival and departure the session produced.
 *
 * Pipeline:
 *   1. this script                                 -> body-corpus.json
 *   2. opencouncil-tasks `observe-documents`       -> observations.json
 *   3. opencouncil-tasks `body-facts`              -> per-body picture
 *
 * Read-only.
 *
 * Usage:
 *   npx tsx scripts/export-body-corpus.ts
 *   npx tsx scripts/export-body-corpus.ts --per-body 60 --min-decisions 20
 *   npx tsx scripts/export-body-corpus.ts --city athens --out athens-corpus.json
 *   npx tsx scripts/export-body-corpus.ts --include-unsupported
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
    const num = (flag: string, fallback: number) => {
        const v = get(flag);
        return v === undefined ? fallback : parseInt(v, 10);
    };
    return {
        city: get("--city"),
        perBody: num("--per-body", 40),
        minDecisions: num("--min-decisions", 10),
        /** Profiling non-customer municipalities wastes model calls on bodies nobody ships. */
        includeUnsupported: argv.includes("--include-unsupported"),
        out: get("--out") ?? "body-corpus.json",
    };
}

/** The document prints a local calendar date; CouncilMeeting.dateTime is UTC. */
function localDate(d: Date, timeZone: string): string {
    return d.toLocaleDateString("en-CA", { timeZone });
}

/**
 * Take `n` items spread evenly across an ordered list, always including the
 * first and last. Even spacing over a date-ordered corpus is what makes a
 * template change visible; taking the newest `n` would hide it.
 */
function stride<T>(items: T[], n: number): T[] {
    if (items.length <= n) return items;
    const step = (items.length - 1) / (n - 1);
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(items[Math.round(i * step)]);
    return [...new Set(out)];
}

/**
 * Order a meeting's decisions so the most informative come first: the highest
 * agenda index leads, because by the last item of a session its document has
 * seen every arrival and departure that session produced. Decisions with no
 * agenda index sort last; they cannot be placed in the session's sequence.
 */
function mostInformativeFirst<T extends { agendaItemIndex: number | null }>(decisions: T[]): T[] {
    return [...decisions].sort((a, b) => {
        if (a.agendaItemIndex === null) return 1;
        if (b.agendaItemIndex === null) return -1;
        return b.agendaItemIndex - a.agendaItemIndex;
    });
}

async function main() {
    const { city, perBody, minDecisions, includeUnsupported, out } = parseArgs();

    const bodies = await prisma.administrativeBody.findMany({
        where: {
            ...(city ? { cityId: city } : {}),
            // Only customer municipalities by default. `pending` cities are
            // imported δήμοι nobody ships, and `demo` ones sit outside the
            // Diavgeia realm entirely.
            ...(includeUnsupported ? {} : { city: { status: "supported" as const } }),
        },
        select: {
            id: true,
            name: true,
            type: true,
            cityId: true,
            diavgeiaUnitIds: true,
            city: { select: { timezone: true, diavgeiaUid: true } },
        },
    });

    const exported = [];
    const skippedBodies: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const body of bodies) {
        const meetings = await prisma.councilMeeting.findMany({
            where: { administrativeBodyId: body.id },
            orderBy: { dateTime: "asc" },
            select: {
                id: true,
                dateTime: true,
                subjects: {
                    where: { decision: { isNot: null } },
                    orderBy: { agendaItemIndex: "asc" },
                    select: {
                        id: true,
                        agendaItemIndex: true,
                        decision: {
                            select: { ada: true, pdfUrl: true, decisionNumber: true, excerpt: true },
                        },
                    },
                },
            },
        });

        const perMeeting = meetings
            .map((m) => ({
                meetingId: m.id,
                meetingDate: localDate(m.dateTime, body.city.timezone),
                decisions: mostInformativeFirst(
                    m.subjects
                        .filter((s) => s.decision?.ada)
                        .map((s) => ({
                            ada: s.decision!.ada!,
                            pdfUrl: s.decision!.pdfUrl,
                            meetingId: m.id,
                            meetingDate: localDate(m.dateTime, body.city.timezone),
                            agendaItemIndex: s.agendaItemIndex,
                            decisionNumber: s.decision!.decisionNumber,
                            /** Whether this document has already been through content extraction. */
                            extracted: s.decision!.excerpt != null,
                        })),
                ),
            }))
            .filter((m) => m.decisions.length > 0);

        const all = perMeeting.flatMap((m) => m.decisions);
        if (all.length < minDecisions) {
            skipped++;
            skippedBodies.push({
                cityId: body.cityId, name: body.name, linkedDecisions: all.length,
                diavgeia: { orgUid: body.city.diavgeiaUid, unitIds: body.diavgeiaUnitIds },
            });
            continue;
        }

        // One decision per meeting first, across meetings spread over the whole
        // period. Only when the body has fewer meetings than the target do we
        // take a second and third from each, since those repeat the preamble.
        const chosenMeetings = stride(perMeeting, perBody);
        const sample: typeof all = [];
        for (let depth = 0; sample.length < perBody; depth++) {
            const added = chosenMeetings
                .filter((m) => m.decisions.length > depth)
                .map((m) => m.decisions[depth]);
            if (added.length === 0) break;
            sample.push(...added.slice(0, perBody - sample.length));
        }
        exported.push({
            cityId: body.cityId,
            administrativeBody: { id: body.id, name: body.name, type: body.type },
            // Carried so a thin body can be topped up straight from Diavgeia:
            // our linked decisions only cover meetings we already hold, which is
            // exactly what a new or lightly covered body does not have.
            diavgeia: { orgUid: body.city.diavgeiaUid, unitIds: body.diavgeiaUnitIds },
            corpusSize: all.length,
            meetings: perMeeting.length,
            /** Distinct meetings the sample covers — the real sample size for anything about attendance. */
            meetingsSampled: new Set(sample.map((d) => d.meetingId)).size,
            earliest: all[0].meetingDate,
            latest: all[all.length - 1].meetingDate,
            sample,
        });
    }

    exported.sort((a, b) => b.corpusSize - a.corpusSize);

    fs.writeFileSync(
        out,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                perBody,
                minDecisions,
                bodies: exported,
                /** Under the threshold. A body here with unit ids is reachable on Diavgeia even though we hold nothing. */
                skippedBodies,
            },
            null,
            2,
        ),
    );

    const totalSample = exported.reduce((n, b) => n + b.sample.length, 0);
    const totalCorpus = exported.reduce((n, b) => n + b.corpusSize, 0);
    const totalMeetings = exported.reduce((n, b) => n + b.meetingsSampled, 0);
    console.log(`Exported ${exported.length} bodies -> ${out}`);
    console.log(`  corpus:  ${totalCorpus} linked decisions`);
    console.log(`  sampled: ${totalSample} documents across ${totalMeetings} distinct meetings`);
    console.log(`  skipped: ${skipped} bodies under ${minDecisions} decisions`);
    for (const b of skippedBodies) {
        const units = (b.diavgeia as { unitIds: string[] }).unitIds;
        if (units.length > 0) {
            console.log(`    reachable on Diavgeia despite holding ${b.linkedDecisions}: ${b.cityId} / ${b.name} (units ${units.join(', ')})`);
        }
    }
    for (const b of exported) {
        console.log(
            `  ${(b.cityId + " / " + b.administrativeBody.name).padEnd(44)} ` +
                `${String(b.sample.length).padStart(3)} of ${String(b.corpusSize).padStart(4)}  ` +
                `${String(b.meetingsSampled).padStart(3)} of ${String(b.meetings).padStart(3)} meetings  ` +
                `${b.earliest} → ${b.latest}`,
        );
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
