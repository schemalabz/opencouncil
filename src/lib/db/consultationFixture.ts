import type { PrismaClient } from '@prisma/client';
// No `server-only`: `npm run seed` imports this module through tsx, outside Next.js.

/** How long the review consultation stays open after the fixture creates it. */
const OPEN_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The regulation of the review consultation: a path under `public/`, which the app serves. */
export const CONSULTATION_FIXTURE_JSON = '/consultations/athens-music-hours.json';

/**
 * Consultation review fixture: a regulation without a map, on Athens. It is the
 * draft regulatory decision on music-hours extension permits, from
 * `public/consultations/athens-music-hours.json`. The text is a draft that the
 * municipality has not adopted.
 *
 * The seed artifact carries the consultations of production, but all of them
 * have a map, and a consultation that has ended takes no comments. This one
 * exercises the text-only layout and the wording of a `regulation`, and it is
 * open: `seed setup`, `seed reset`, and `seed fixtures` add it to a local
 * database and to a preview. A second run keeps the end date while the
 * consultation is open, and sets a new one after the consultation has closed.
 */
export async function ensureConsultationFixture(db: PrismaClient, log: (line: string) => void = () => {}): Promise<void> {
    const athens = await db.city.findUnique({ where: { id: 'athens' }, select: { id: true } });
    if (!athens) {
        log('Athens is not in this database: skipping the consultation review fixture.');
        return;
    }
    log('Seeding consultation review fixture (athens/music-hours)...');

    await db.city.update({ where: { id: 'athens' }, data: { consultationsEnabled: true } });

    // The end date holds the city's wall time in the UTC fields: 23:59 on the last day.
    const endDate = new Date();
    endDate.setUTCDate(endDate.getUTCDate() + OPEN_DAYS);
    endDate.setUTCHours(23, 59, 0, 0);

    // The stored wall time is ahead of the real end by the city's UTC offset: one day covers it.
    const existing = await db.consultation.findUnique({ where: { id: 'music-hours' }, select: { endDate: true } });
    const hasClosed = !!existing && existing.endDate.getTime() < Date.now() + DAY_MS;

    const consultation = {
        name: 'Άδεια παράτασης ωραρίου μουσικής στα καταστήματα',
        jsonUrl: CONSULTATION_FIXTURE_JSON,
        isActive: true,
        cityId: 'athens',
    };
    await db.consultation.upsert({
        where: { id: 'music-hours' },
        update: hasClosed ? { ...consultation, endDate } : consultation,
        create: { id: 'music-hours', ...consultation, endDate },
    });
    log('Consultation review fixture seeded.');
}
