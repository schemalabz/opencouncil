/**
 * Write fixtures/body-conventions.json to the database in DATABASE_URL.
 *
 *   npx tsx scripts/import-body-conventions.ts
 *
 * Idempotent. Bodies a person has confirmed in admin are left alone; bodies
 * the database does not hold are listed. The seed runs the same import, so a
 * fresh local or preview database needs nothing; staging and production run
 * this once after the migration that adds the column, and again whenever the
 * file changes. See docs/guides/meeting-minutes.md → "Where a body's rules live".
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { importBodyConventions, type BodyConventionsRecord } from '@/lib/db/bodyConventionsImport';

async function main() {
    const prisma = new PrismaClient();
    const { bodies } = JSON.parse(fs.readFileSync('fixtures/body-conventions.json', 'utf-8')) as { bodies: BodyConventionsRecord[] };
    const r = await importBodyConventions(bodies, prisma);
    for (const key of r.confirmedSkipped) console.log(`${key}: left alone, confirmed by a person`);
    for (const key of r.missing) console.log(`${key}: no such body in this database`);
    console.log(`${r.written.length}/${bodies.length} written, ${r.confirmedSkipped.length} confirmed and left alone, ${r.missing.length} not in this database`);
    await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
