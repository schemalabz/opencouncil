/**
 * Delete the voiceprints of every person with no voiceprint consent in force,
 * with their audio clips. A one-time cleanup: voiceprints were generated
 * before consent was read, and the gate only stops their use. A withdrawal
 * deletes from now on, so a second run finds only what a failed clip delete
 * left behind.
 *
 *   npm run voiceprints:delete-without-consent                      # list only
 *   npm run voiceprints:delete-without-consent -- --city athens     # one city, list only
 *   npm run voiceprints:delete-without-consent -- --delete          # delete
 *
 * Reads DATABASE_URL and the Spaces settings from the environment. Check
 * which database .env points at before running with --delete. The npm
 * script puts scripts/shims on NODE_PATH: the deletion module is marked
 * server-only, and that marker has no runtime module outside Next.js.
 */
import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '../src/lib/db/prisma';
import { deleteVoicePrintsWithoutConsent } from '../src/lib/db/voiceprintsDelete';

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('city', { type: 'string', describe: 'Only people of this city id' })
        .option('delete', { type: 'boolean', default: false, describe: 'Delete the rows and the clips; without it the script only lists them' })
        .strict()
        .parse();

    const dryRun = !argv.delete;
    const { voicePrints, clipFailures } = await deleteVoicePrintsWithoutConsent({ cityId: argv.city, dryRun });

    const byCity = new Map<string, number>();
    for (const voicePrint of voicePrints) {
        console.log(`${voicePrint.person.cityId}\t${voicePrint.person.name}\t${voicePrint.id}\t${voicePrint.sourceAudioUrl}`);
        byCity.set(voicePrint.person.cityId, (byCity.get(voicePrint.person.cityId) ?? 0) + 1);
    }
    for (const [cityId, count] of byCity) console.log(`${cityId}: ${count}`);
    console.log(`${voicePrints.length} voiceprint(s) of people without a consent in force${dryRun ? ' (not deleted: run with --delete)' : ' deleted'}`);
    for (const failure of clipFailures) {
        console.error(`Clip not deleted for voiceprint ${failure.voicePrintId}: ${failure.sourceAudioUrl} (${failure.error})`);
    }
    if (clipFailures.length > 0) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
