/**
 * Derive (and store) a meeting's per-subject attendance and votes from stored facts.
 *   npx tsx scripts/derive-meeting.ts <cityId> <meetingId> [--dry]
 * Prints the row counts, a sha256 of the sorted rows (compare two runs), and the issues.
 */
import { createHash } from 'crypto';
import { deriveMeetingFacts, loadDerivationInput, applyDerivation } from '@/lib/derivation';
import { hasNothingToDeriveFrom } from '@/lib/derivation/persist';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';

async function main() {
    const [cityId, meetingId, ...flags] = process.argv.slice(2);
    if (!cityId || !meetingId) { console.error('usage: derive-meeting.ts <cityId> <meetingId> [--dry]'); process.exit(2); }
    const input = await loadDerivationInput(cityId, meetingId);
    if (hasNothingToDeriveFrom(input)) { console.log(`${cityId}/${meetingId}: no stored facts (documents read before task v3 facts); re-poll it. Rows untouched.`); return; }
    const out = deriveMeetingFacts(input);
    if (!flags.includes('--dry')) await applyDerivation(input, out);
    const rows = [...out.attendance.map(a => `A ${a.subjectId} ${a.personId} ${a.status}`), ...out.votes.map(v => `V ${v.subjectId} ${v.personId} ${v.voteType}`)].sort();
    const hash = createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16);
    console.log(`${cityId}/${meetingId}: ${out.attendance.length} attendance rows, ${out.votes.length} vote rows, ${out.issues.length} issues, hash ${hash}${flags.includes('--dry') ? ' (dry)' : ''}`);
    for (const i of out.issues) console.log(`  ${i.code.padEnd(24)} ${i.subjectId ?? '-'} ${i.personId ?? ''} ${issueMessageEn(i)}`);
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
