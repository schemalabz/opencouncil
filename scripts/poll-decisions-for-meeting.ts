/**
 * Start a decision poll for one meeting from the command line, without the
 * admin UI. The task server must be reachable at TASK_API_URL and this app
 * must be running at NEXTAUTH_URL so the callback can land.
 *
 *   npx tsx scripts/poll-decisions-for-meeting.ts <cityId> <meetingId> [--force]
 *
 * Prints TASK_ID=<taskStatusId> on success; poll TaskStatus.status for completion.
 */
import { pollDecisionsForMeeting } from '@/lib/tasks/pollDecisions';

const [cityId, meetingId, ...flags] = process.argv.slice(2);
if (!cityId || !meetingId) {
    console.error('usage: poll-decisions-for-meeting.ts <cityId> <meetingId> [--force]');
    process.exit(1);
}
pollDecisionsForMeeting(cityId, meetingId, { silent: true, forceExtract: flags.includes('--force') })
    .then((result) => { console.log(`TASK_ID=${result.id}`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
