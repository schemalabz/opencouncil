/**
 * Print the sentences the extractor is told about a body — the exact text the
 * poll request carries — so a document can be read from the command line the
 * way production reads it (opencouncil-tasks: `extract-decision --hints-file`).
 *
 *   npx tsx scripts/conventions-text.ts <cityId> "<body name>" [--all]
 *
 * --all prints every body with a record, as `cityId/body` headers, to feed a
 * batch. Reads fixtures/body-conventions.json, not the database, so it says
 * what the record starts from; a person's confirmation changes no sentence.
 */
import fs from 'fs';
import { conventionsGlossaryEn, renderConventionsText } from '@/lib/decisionConventionsText';
import type { BodyConventionsRecord } from '@/lib/db/bodyConventionsImport';

const { bodies } = JSON.parse(fs.readFileSync('fixtures/body-conventions.json', 'utf-8')) as { bodies: BodyConventionsRecord[] };
const [cityId, body] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (process.argv.includes('--all')) {
    for (const b of bodies) console.log(`### ${b.cityId}/${b.body}\n${renderConventionsText(b.conventions, conventionsGlossaryEn)}\n`);
} else {
    const b = bodies.find(b => b.cityId === cityId && b.body === body);
    if (!b) { console.error(`no record for ${cityId}/${body}`); process.exit(1); }
    console.log(renderConventionsText(b.conventions, conventionsGlossaryEn));
}
