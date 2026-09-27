#!/usr/bin/env tsx
/**
 * Seeds DecisionCandidate rows for one meeting, covering every state the
 * meeting record page can show, so the page can be verified by hand in a
 * browser. A normal pollDecisions run is what creates these rows in
 * production; the local dev database has none, so the page's most
 * important states are otherwise impossible to see locally.
 *
 * States seeded, one row each:
 *   - confident proposal:  subjectId set, confidence >= LIKELY_MATCH_THRESHOLD,
 *                           on a subject with no Decision yet
 *   - quiet proposal:      same, but confidence below the threshold
 *   - 3 unmatched:         subjectId null — decisions matching no subject
 *   - conflict:            ada already held by a Decision on a DIFFERENT
 *                           subject of the same meeting (see
 *                           getConflictingCandidates in
 *                           src/lib/db/decisionCandidates.ts)
 *
 * Local-only: refuses to run against anything but the local dev database.
 * Idempotent: rows use deterministic ids, so a re-run updates them in place
 * instead of duplicating them.
 *
 * Usage:
 *   npx tsx scripts/seed-decision-candidates.ts --city athens --meeting feb11_2026
 *   npx tsx scripts/seed-decision-candidates.ts --city athens --meeting feb11_2026 --clear
 */
import { PrismaClient } from "@prisma/client";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { localCalendarDate } from "@/lib/formatters/time";
import { assertLocalDatabase } from "./lib/local-database";

// Never the ambient DATABASE_URL (dotenv is not loaded on purpose) — that
// points at production in this environment. This is the only database the
// script will ever touch.
const LOCAL_DB_URL = "postgresql://opencouncil@127.0.0.1:5432/opencouncil";

const prisma = new PrismaClient({ datasourceUrl: LOCAL_DB_URL });

function idFor(cityId: string, meetingId: string, slug: string): string {
    return `seed-decision-candidate-${cityId}-${meetingId}-${slug}`;
}

function parseArgs() {
    return yargs(hideBin(process.argv))
        .usage("Usage: $0 --city <cityId> --meeting <meetingId> [--clear]")
        .option("city", { type: "string", demandOption: true, describe: "cityId, e.g. athens" })
        .option("meeting", { type: "string", demandOption: true, describe: "CouncilMeeting id, e.g. feb11_2026" })
        .option("clear", { type: "boolean", default: false, describe: "Remove the fixture rows instead of creating them" })
        .strict()
        .help()
        .argv as unknown as { city: string; meeting: string; clear: boolean };
}

async function clearFixtures(cityId: string, meetingId: string): Promise<void> {
    const { count } = await prisma.decisionCandidate.deleteMany({
        where: { id: { startsWith: `seed-decision-candidate-${cityId}-${meetingId}-` } },
    });
    console.log(`Removed ${count} fixture DecisionCandidate row(s) for ${cityId}/${meetingId}.`);
}

async function seedFixtures(cityId: string, meetingId: string): Promise<void> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { dateTime: true, city: { select: { timezone: true } } },
    });
    if (!meeting) throw new Error(`No CouncilMeeting ${meetingId} in city ${cityId}.`);
    const meetingDate = new Date(`${localCalendarDate(meeting.dateTime, meeting.city.timezone)}T00:00:00Z`);

    const subjects = await prisma.subject.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: { id: true, name: true, decision: { select: { id: true, ada: true } } },
        orderBy: { id: "asc" },
    });
    const decisionless = subjects.filter(s => !s.decision);
    const decided = subjects.filter((s): s is typeof s & { decision: { id: string; ada: string | null } } => s.decision !== null && s.decision.ada !== null);

    if (decisionless.length < 3) {
        throw new Error(
            `${cityId}/${meetingId} has only ${decisionless.length} subject(s) with no Decision yet; need at least 3 ` +
            `(two proposal targets + one conflict claimant). Pick a different meeting.`,
        );
    }
    if (decided.length < 1) {
        throw new Error(
            `${cityId}/${meetingId} has no subject with a Decision carrying an ada; need at least 1 to build the ` +
            `conflict row. Pick a different meeting.`,
        );
    }

    const [confidentSubject, quietSubject, conflictSubject] = decisionless;
    const adaHolder = decided[0];

    const pdfUrl = (ada: string) => `https://diavgeia.gov.gr/doc/${ada}`;
    const publishDateAfter = (days: number) => new Date(meetingDate.getTime() + days * 24 * 60 * 60 * 1000);

    const rows: Array<{
        slug: string;
        ada: string;
        title: string;
        decisionNumber: string;
        subjectId: string | null;
        confidence: number | null;
        reasoning: string | null;
        publishDate: Date;
    }> = [
        {
            slug: "confident",
            ada: "9SEEDΩ6Μ-01Χ",
            title: `[SEED] Απόφαση για "${confidentSubject.name}"`,
            decisionNumber: "1/2026",
            subjectId: confidentSubject.id,
            confidence: 0.82,
            reasoning: "[SEED] Ο τίτλος της απόφασης ταιριάζει σχεδόν λέξη προς λέξη με το θέμα.",
            publishDate: publishDateAfter(2),
        },
        {
            slug: "quiet",
            ada: "9SEEDΩ6Μ-02Χ",
            title: `[SEED] Πράξη σχετική με "${quietSubject.name}"`,
            decisionNumber: "2/2026",
            subjectId: quietSubject.id,
            confidence: 0.35,
            reasoning: "[SEED] Επικαλύπτεται μερικώς η θεματολογία, χωρίς σαφή αντιστοίχιση.",
            publishDate: publishDateAfter(3),
        },
        {
            slug: "unmatched-1",
            ada: "9SEEDΩ6Μ-03Χ",
            title: "[SEED] Έγκριση δαπάνης προμήθειας γραφικής ύλης",
            decisionNumber: "3/2026",
            subjectId: null,
            confidence: null,
            reasoning: null,
            publishDate: publishDateAfter(1),
        },
        {
            slug: "unmatched-2",
            ada: "9SEEDΩ6Μ-04Χ",
            title: "[SEED] Ορισμός υπολόγου διαχείρισης παγίας προκαταβολής",
            decisionNumber: "4/2026",
            subjectId: null,
            confidence: null,
            reasoning: null,
            publishDate: publishDateAfter(4),
        },
        {
            slug: "unmatched-3",
            ada: "9SEEDΩ6Μ-05Χ",
            title: "[SEED] Έγκριση πρακτικού επιτροπής παραλαβής υπηρεσιών",
            decisionNumber: "5/2026",
            subjectId: null,
            confidence: null,
            reasoning: null,
            publishDate: publishDateAfter(5),
        },
        {
            // Reuses a real, already-linked ada so getConflictingCandidates finds a
            // genuine holder: adaHolder's Decision sits on a different subject
            // (adaHolder itself) than the one this row proposes (conflictSubject).
            slug: "conflict",
            ada: adaHolder.decision.ada!,
            title: `[SEED] Πρόταση για "${conflictSubject.name}" (ίδιο ΑΔΑ με άλλο θέμα)`,
            decisionNumber: "6/2026",
            subjectId: conflictSubject.id,
            confidence: 0.55,
            reasoning: "[SEED] Το ΑΔΑ αυτό έχει ήδη συνδεθεί με άλλο θέμα της ίδιας συνεδρίασης.",
            publishDate: publishDateAfter(2),
        },
    ];

    for (const row of rows) {
        const id = idFor(cityId, meetingId, row.slug);
        await prisma.decisionCandidate.upsert({
            where: { id },
            create: {
                id,
                cityId,
                ada: row.ada,
                title: row.title,
                pdfUrl: pdfUrl(row.ada),
                publishDate: row.publishDate,
                decisionNumber: row.decisionNumber,
                meetingDate,
                readStatus: "ok",
                councilMeetingId: meetingId,
                subjectId: row.subjectId,
                confidence: row.confidence,
                reasoning: row.reasoning,
            },
            update: {
                ada: row.ada,
                title: row.title,
                pdfUrl: pdfUrl(row.ada),
                publishDate: row.publishDate,
                decisionNumber: row.decisionNumber,
                meetingDate,
                readStatus: "ok",
                councilMeetingId: meetingId,
                subjectId: row.subjectId,
                confidence: row.confidence,
                reasoning: row.reasoning,
                dismissedAt: null,
                decisionId: null,
            },
        });
        console.log(`Upserted ${row.slug} (${id}), ada=${row.ada}`);
    }

    console.log(
        `\nSeeded 6 DecisionCandidate rows for ${cityId}/${meetingId}:\n` +
        `  confident proposal -> subject ${confidentSubject.id} (${confidentSubject.name})\n` +
        `  quiet proposal      -> subject ${quietSubject.id} (${quietSubject.name})\n` +
        `  3 unmatched (no subject)\n` +
        `  conflict            -> claims subject ${conflictSubject.id} (${conflictSubject.name}), ` +
        `ada already held by subject ${adaHolder.id} (${adaHolder.name})`,
    );
}

async function main() {
    const args = parseArgs();
    await assertLocalDatabase(prisma, ["opencouncil"]);

    if (args.clear) {
        await clearFixtures(args.city, args.meeting);
    } else {
        await seedFixtures(args.city, args.meeting);
    }
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
