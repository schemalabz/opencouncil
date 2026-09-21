/**
 * Render a meeting's minutes DOCX from the local database, outside the app's auth.
 *   npx tsx scripts/render-minutes-docx.ts <cityId> <meetingId> <out.docx>
 */
import fs from 'fs';
import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { renderMinutesDocx } from '@/components/meetings/docx/MinutesDocx';

async function main() {
    const [cityId, meetingId, out] = process.argv.slice(2);
    if (!cityId || !meetingId || !out) { console.error('usage: render-minutes-docx.ts <cityId> <meetingId> <out.docx>'); process.exit(2); }
    const data = await getMinutesData(cityId, meetingId);
    const blob = await renderMinutesDocx(data);
    fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
    console.log(`wrote ${out} (${data.subjects.length} subjects, ${data.attendanceChanges.length} changes, source ${data.attendanceChangesSource})`);
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
