/**
 * Evaluate the related-subjects hybrid search by printing the results for a
 * given subject.
 *
 * Usage:
 *   npx tsx scripts/evaluate-related-subjects.ts <subjectId>
 *   npx tsx scripts/evaluate-related-subjects.ts --name "<partial name>"
 *
 * Requires ELASTICSEARCH_URL, ELASTICSEARCH_API_KEY, ELASTICSEARCH_INDEX, and
 * a working DATABASE_URL in the environment (i.e. run inside the nix dev shell
 * with a populated .env).
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { findRelatedSubjects } from '@/lib/search/related';
import { searchSubjectsByName } from '@/lib/db/subject';

type SourceSubject = {
    id: string;
    name: string;
    description: string | null;
    cityId: string;
    topicId: string | null;
    councilMeeting: { administrativeBodyId: string | null } | null;
};

async function resolveSubject(args: {
    id?: string;
    name?: string;
}): Promise<SourceSubject> {
    if (args.id) {
        const subject = await prisma.subject.findUnique({
            where: { id: args.id },
            select: {
                id: true,
                name: true,
                description: true,
                cityId: true,
                topicId: true,
                councilMeeting: { select: { administrativeBodyId: true } },
            },
        });
        if (!subject) {
            throw new Error(`No subject with id ${args.id}`);
        }
        return subject;
    }

    if (args.name) {
        const hits = await searchSubjectsByName(args.name, 20);
        if (hits.length === 0) {
            throw new Error(`No subjects matched name "${args.name}"`);
        }
        if (hits.length > 1) {
            console.log(`Multiple matches for "${args.name}" — pick one and re-run with its id:`);
            for (const h of hits) {
                console.log(`  ${h.id}  ${h.name}  (city=${h.cityId})`);
            }
            process.exit(0);
        }
        return resolveSubject({ id: hits[0].id });
    }

    throw new Error('Provide either a subjectId positional or --name "<query>"');
}

function fmtScore(score: number): string {
    return score.toFixed(4).padStart(7);
}

function truncate(s: string | null | undefined, width: number): string {
    const v = s ?? '';
    return v.length > width ? v.slice(0, width - 1) + '…' : v.padEnd(width);
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .usage('$0 [subjectId] [--name <query>]')
        .positional('subjectId', { type: 'string', describe: 'Subject ID to evaluate' })
        .option('name', { type: 'string', describe: 'Find a subject by partial name (case-insensitive)' })
        .help()
        .parseAsync();

    const subjectId = argv._[0] as string | undefined;
    const source = await resolveSubject({ id: subjectId, name: argv.name });

    const sourceAdminBodyId = source.councilMeeting?.administrativeBodyId ?? null;

    console.log('=== Source subject ===');
    console.log(`  id:          ${source.id}`);
    console.log(`  name:        ${source.name}`);
    console.log(`  cityId:      ${source.cityId}`);
    console.log(`  topicId:     ${source.topicId ?? '(none)'}`);
    console.log(`  adminBody:   ${sourceAdminBodyId ?? '(none)'}`);
    console.log(`  description: ${truncate(source.description, 120).trim() || '(none)'}`);

    const results = await findRelatedSubjects({
        subjectId: source.id,
        subjectName: source.name,
        subjectDescription: source.description,
        topicId: source.topicId,
    });

    if (results.length === 0) {
        console.log('\nNo related subjects returned.');
        return;
    }

    const sameBody = results.filter(
        r =>
            r.cityId === source.cityId &&
            sourceAdminBodyId !== null &&
            r.adminBodyId === sourceAdminBodyId
    );
    const elsewhere = results.filter(r => !sameBody.includes(r));

    sameBody.sort((a, b) => {
        if (!a.meetingDate && !b.meetingDate) return 0;
        if (!a.meetingDate) return 1;
        if (!b.meetingDate) return -1;
        return new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime();
    });

    const printGroup = (label: string, group: typeof results) => {
        console.log(`\n=== ${label} (${group.length}) ===`);
        if (group.length === 0) {
            console.log('  (empty)');
            return;
        }
        console.log(`  #  ${'score'.padStart(7)}  ${'date'.padEnd(10)}  ${'topic'.padEnd(20)}  ${'city'.padEnd(18)}  ${'body'.padEnd(28)}  name`);
        group.forEach((r, i) => {
            const rank = String(i + 1).padStart(2);
            const date = (r.meetingDate ?? '').slice(0, 10).padEnd(10);
            const topic = truncate(r.topicName, 20);
            const city = truncate(r.cityName, 18);
            const body = truncate(r.adminBodyName, 28);
            console.log(`  ${rank} ${fmtScore(r.score)}  ${date}  ${topic}  ${city}  ${body}  ${r.name}`);
        });
    };

    printGroup('sameBody (same city + administrative body, by date DESC)', sameBody);
    printGroup('elsewhere (by RRF score DESC)', elsewhere);

    console.log(`\nTotal results: ${results.length}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
