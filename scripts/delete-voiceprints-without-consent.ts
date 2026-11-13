/**
 * Delete the voice data of every person with no voiceprint consent in force:
 * their voiceprint rows, and every clip in their clip folder, also a clip that
 * no row names any more. Clips in the folder of a person who no longer exists
 * go too. Voiceprints were generated before consent was read; run this once
 * when the consent gate deploys, and again whenever an alert says that a
 * deletion failed.
 *
 *   npm run voiceprints:delete-without-consent                      # list only
 *   npm run voiceprints:delete-without-consent -- --city athens     # one city, list only
 *   DEPLOYMENT_ENV=production npm run voiceprints:delete-without-consent -- --delete
 *
 * --city takes the rows of the city's people, the clips in the city's
 * folder, which holds the clips cut from the city's meetings, and the clips
 * of people who no longer exist, in any folder.
 *
 * Reads DATABASE_URL and the Spaces settings from the environment; the list
 * needs a database user that can read VoicePrintConsent. --delete runs only
 * with DEPLOYMENT_ENV=production set explicitly: elsewhere the people can
 * carry production ids, and the bucket setting can name the production
 * bucket.
 */
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { isClipKeyPart, planVoiceDataDeletion, runVoiceDataDeletion } from '@/lib/db/voiceprintsDelete';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('city', { type: 'string', requiresArg: true, describe: "Only this city: its people's rows, its clip folder, and the clips of people who no longer exist" })
        .option('delete', { type: 'boolean', default: false, describe: 'Delete the rows and the clips; without it the script only lists them' })
        .check(({ city }) => {
            if (city !== undefined && !isClipKeyPart(city)) throw new Error(`Not a city id: "${city}"`);
            return true;
        })
        .strict()
        .parse();

    if (argv.delete && process.env.DEPLOYMENT_ENV !== 'production') {
        console.error('--delete runs only with DEPLOYMENT_ENV=production set explicitly. Run without --delete to list.');
        process.exitCode = 1;
        return;
    }

    const plan = await planVoiceDataDeletion({ cityId: argv.city });

    const byCity = new Map<string, number>();
    for (const voicePrint of plan.voicePrints) {
        console.log(`row\t${voicePrint.person.cityId}\t${voicePrint.person.name}\t${voicePrint.id}\t${voicePrint.sourceAudioUrl}`);
        byCity.set(voicePrint.person.cityId, (byCity.get(voicePrint.person.cityId) ?? 0) + 1);
    }
    for (const clip of plan.clips) console.log(`clip\t${clip.bucket}\t${clip.key}`);
    for (const [cityId, count] of byCity) console.log(`${cityId}: ${count}`);
    if (!plan.listed) console.error('No storage keys: the clips were not listed.');
    for (const failure of plan.listFailures) console.error(`Not listed: ${failure.item} (${failure.error})`);
    const complete = plan.listed && plan.listFailures.length === 0;
    if (!complete) process.exitCode = 1;

    const found = `${plan.voicePrints.length} voiceprint row(s) and ${plan.clips.length} clip(s) of people without a consent in force`;
    if (!argv.delete) {
        console.log(`${found}: not deleted (run with --delete)`);
        return;
    }
    // The rows name the buckets that the next run lists, so they stay until
    // every clip folder could be listed.
    if (!complete) {
        console.error(`${found}: not deleted, because the clip listing is incomplete.`);
        return;
    }

    const failures = await runVoiceDataDeletion(plan);
    for (const failure of failures) console.error(`Not deleted: ${failure.item} (${failure.error})`);
    console.log(`${found}: deleted, ${failures.length} failure(s)`);
    if (failures.length > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
