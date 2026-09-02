/**
 * Generate illustrations for subjects that do not have one yet.
 *
 * The read route fills old subjects in lazily, so this is optional. It exists
 * for two reasons: every card gets an image from day one, and running the
 * prompt over many subjects at once shows where the style breaks.
 *
 *   npx tsx scripts/backfill-subject-images.ts --limit 50
 *   npx tsx scripts/backfill-subject-images.ts --city athens --concurrency 4
 *   npx tsx scripts/backfill-subject-images.ts --months 3 --limit 200
 *   npx tsx scripts/backfill-subject-images.ts --force --limit 10   # redraw even if an image exists
 *
 * Subjects go in the landing page's order of importance, so `--limit 50` draws
 * the 50 subjects a visitor is most likely to see. Only subjects the landing
 * can show are ranked: released meetings, public cities, discussed subjects.
 * The pipeline and the read route cover the rest.
 */
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '../src/lib/db/prisma';
import { getSubjectsForImageBackfill } from '../src/lib/db/subject';
import { rankSubjectIdsForImages } from '../src/lib/subjectImageBackfill';
import { generateImageForSubject, isSubjectImageGenerationEnabled, type GenerateOutcome } from '../src/lib/subjectImages';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('city', { type: 'string', describe: 'Only subjects of this city id' })
        .option('limit', { type: 'number', describe: 'Only the N most important subjects' })
        .option('months', { type: 'number', describe: 'Only meetings from the last N months (default: all time)' })
        .option('concurrency', { type: 'number', default: 3, describe: 'Generations in flight at once' })
        .option('force', { type: 'boolean', default: false, describe: 'Redraw subjects that already have an image' })
        .strict()
        .parse();

    if (!isSubjectImageGenerationEnabled()) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const candidates = await getSubjectsForImageBackfill({ cityId: argv.city, monthsBack: argv.months });
    const subjects = rankSubjectIdsForImages(candidates).slice(0, argv.limit);
    console.log(`${subjects.length} of ${candidates.length} subjects to check, concurrency ${argv.concurrency}${argv.force ? ', force' : ''}`);

    const counts: Record<GenerateOutcome | 'failed', number> = {
        generated: 0, exists: 0, 'in-flight': 0, 'recent-failure': 0, disabled: 0, failed: 0,
    };
    const queue = [...subjects];
    let done = 0;

    const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            try {
                counts[await generateImageForSubject(id, { force: argv.force })]++;
            } catch {
                counts.failed++;
            }
            done++;
            if (done % 25 === 0 || done === subjects.length) {
                console.log(`${done}/${subjects.length}`, counts);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(argv.concurrency, queue.length) }, worker));

    console.log('done', counts);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
