/**
 * Print the MinutesData a meeting's Πρακτικά would be rendered from, as JSON,
 * without the admin UI. This is the meeting-level view the extraction
 * workstream scores: per subject, who was present, who arrived or left, how
 * the vote went, and the decision text.
 *
 *   npx tsx scripts/minutes-data-for-meeting.ts <cityId> <meetingId> [out.json]
 */
import fs from 'fs';
import { getMinutesData } from '@/lib/minutes/getMinutesData';

const [cityId, meetingId, out] = process.argv.slice(2);
if (!cityId || !meetingId) {
    console.error('usage: minutes-data-for-meeting.ts <cityId> <meetingId> [out.json]');
    process.exit(1);
}
getMinutesData(cityId, meetingId)
    .then((data) => {
        const json = JSON.stringify(data, null, 2);
        if (out) { fs.writeFileSync(out, json); console.log(`wrote ${out}`); } else console.log(json);
        process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
