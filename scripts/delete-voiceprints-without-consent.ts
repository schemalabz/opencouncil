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
import { planVoiceDataSweep, runVoiceDataSweep, voiceprintClipFolder } from '@/lib/db/voiceprintsDelete';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('city', { type: 'string', requiresArg: true, describe: 'Only people of this city id' })
        .option('delete', { type: 'boolean', default: false, describe: 'Delete the rows and the clips; without it the script only lists them' })
        .check(({ city }) => {
            if (city !== undefined) voiceprintClipFolder(city);
            return true;
        })
        .strict()
        .parse();

    if (argv.delete && process.env.DEPLOYMENT_ENV !== 'production') {
        console.error('--delete runs only with DEPLOYMENT_ENV=production set explicitly. Run without --delete to list.');
        process.exitCode = 1;
        return;
    }

    const sweep = await planVoiceDataSweep({ cityId: argv.city });

    const byCity = new Map<string, number>();
    for (const voicePrint of sweep.voicePrints) {
        console.log(`row\t${voicePrint.person.cityId}\t${voicePrint.person.name}\t${voicePrint.id}\t${voicePrint.sourceAudioUrl}`);
        byCity.set(voicePrint.person.cityId, (byCity.get(voicePrint.person.cityId) ?? 0) + 1);
    }
    for (const clip of sweep.clips) console.log(`clip\t${clip.bucket}\t${clip.key}`);
    for (const [cityId, count] of byCity) console.log(`${cityId}: ${count}`);
    for (const failure of sweep.listFailures) console.error(`Not listed: ${failure.clip} (${failure.error})`);
    if (sweep.listFailures.length > 0) process.exitCode = 1;

    const found = `${sweep.voicePrints.length} voiceprint row(s) and ${sweep.clips.length} clip(s) of people without a consent in force`;
    if (!argv.delete) {
        console.log(`${found}: not deleted (run with --delete)`);
        return;
    }

    const failures = await runVoiceDataSweep(sweep);
    for (const failure of failures) console.error(`Not deleted: ${failure.clip} (${failure.error})`);
    console.log(`${found}: deleted, ${failures.length} failure(s)`);
    if (failures.length > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
