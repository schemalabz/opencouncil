import type { PrismaClient } from '@prisma/client';
import { defaultTierOf } from '@/lib/utils/bodyTier';
// No `server-only`: `npm run seed` imports this module through tsx, outside Next.js.

export const REGION_FIXTURE_CITY_ID = 'seed-thessalia';
const MEETING_ID = 'seed-region-sep-2026';
const COMMITTEE_MEETING_ID = 'seed-region-committee-sep-2026';

/**
 * A rough outline of Thessaly, not the official boundary: the mainland, then
 * Skiathos and Skopelos. A region with islands is a MultiPolygon, so the
 * fixture is one too.
 */
const OUTLINE: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
        [[
            [21.10, 39.55], [21.20, 39.85], [21.55, 39.95], [22.00, 39.98], [22.35, 40.10], [22.65, 39.98],
            [22.90, 39.60], [23.10, 39.40], [23.35, 39.15], [23.10, 39.05], [22.95, 39.10], [22.80, 39.00],
            [22.40, 39.00], [21.90, 39.05], [21.45, 39.15], [21.15, 39.30], [21.10, 39.55],
        ]],
        [[[23.40, 39.13], [23.52, 39.13], [23.52, 39.21], [23.40, 39.21], [23.40, 39.13]]],
        [[[23.60, 39.07], [23.80, 39.07], [23.80, 39.20], [23.60, 39.20], [23.60, 39.07]]],
    ],
};

/**
 * Region review fixture (#993): a small dataset for a region, which is a
 * `City` row with `authorityType = region`. The seed artifact carries no
 * region, so `seed setup`, `seed reset` and `seed fixtures` add this one to a
 * local database, and prisma/seed.ts adds it to a preview. All rows use fixed
 * `seed-region-*` ids and upserts, so a second run changes nothing.
 *
 * The status is `pending`, as for the first real region: the pages open by
 * their link, and the region is not in the sitemap, on the landing map or in
 * the list of supported cities. It is still in the lists that hold a city of
 * any status: the city pickers of the petition and of the notifications, and
 * `GET /api/cities/all`. `GET /api/cities/at` gives the smallest outline at a
 * point, so it gives the region only where no municipality covers the point.
 *
 * The party and the people are fictional. The fixture has what the titles of
 * a region depend on:
 * - a head with no stored role name, so the title comes from the catalog;
 * - a deputy with a stored «Αντιπεριφερειάρχης …» role name;
 * - a councillor with no party, for the "independent" label;
 * - two committees, to show how the one label of the committee type reads.
 *
 * The topics are the first two of the Greek taxonomy. An empty database has
 * none, and then the subjects and the speaker segments have no topic.
 */
export async function ensureRegionFixture(db: PrismaClient, log: (line: string) => void = () => {}): Promise<void> {
    const cityId = REGION_FIXTURE_CITY_ID;
    log(`Seeding region review fixture (${cityId})...`)

    const city = {
        name: 'Θεσσαλία',
        name_en: 'Thessaly',
        name_municipality: 'Περιφέρεια Θεσσαλίας',
        name_municipality_en: 'Region of Thessaly',
        timezone: 'Europe/Athens',
        status: 'pending' as const,
        authorityType: 'region' as const,
        language: 'el' as const,
        realm: 'greece' as const,
    }
    await db.city.upsert({ where: { id: cityId }, update: city, create: { id: cityId, ...city } })
    // Prisma cannot write a PostGIS column.
    await db.$executeRaw`
        UPDATE "City" SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(OUTLINE)}), 4326) WHERE id = ${cityId}`

    const bodies = [
        { id: 'seed-region-council', name: 'Περιφερειακό Συμβούλιο', name_en: 'Regional Council', type: 'council' as const },
        { id: 'seed-region-committee', name: 'Περιφερειακή Επιτροπή', name_en: 'Regional Committee', type: 'committee' as const },
        {
            id: 'seed-region-committee-environment',
            name: 'Επιτροπή Περιβάλλοντος και Χωρικού Σχεδιασμού',
            name_en: 'Environment and Spatial Planning Committee',
            type: 'committee' as const,
        },
    ]
    for (const { id, ...body } of bodies) {
        const data = { ...body, tier: defaultTierOf(body.type), cityId }
        await db.administrativeBody.upsert({ where: { id }, update: data, create: { id, ...data } })
    }

    const party = {
        name: 'Θεσσαλική Πρωτοβουλία',
        name_en: 'Thessalian Initiative',
        name_short: 'ΘΠ',
        name_short_en: 'TI',
        colorHex: '#0f766e',
        cityId,
    }
    await db.party.upsert({ where: { id: 'seed-region-party' }, update: party, create: { id: 'seed-region-party', ...party } })

    const inParty = { partyId: 'seed-region-party' }
    const councilSeat = { administrativeBodyId: 'seed-region-council' }
    const persons = [
        {
            id: 'seed-region-person-governor',
            name: 'Ελένη Καρανίκα', name_en: 'Eleni Karanika', name_short: 'Ε. Καρανίκα', name_short_en: 'E. Karanika',
            // No stored name: the title of the head comes from the catalog.
            roles: [{ key: 'head', cityId, isHead: true }, { key: 'party', ...inParty, isHead: true }],
        },
        {
            id: 'seed-region-person-deputy',
            name: 'Νίκος Παπαστεργίου', name_en: 'Nikos Papastergiou', name_short: 'Ν. Παπαστεργίου', name_short_en: 'N. Papastergiou',
            roles: [
                { key: 'deputy', cityId, name: 'Αντιπεριφερειάρχης Αγροτικής Ανάπτυξης', name_en: 'Deputy Regional Governor for Rural Development' },
                { key: 'party', ...inParty },
                { key: 'council', ...councilSeat },
            ],
        },
        {
            id: 'seed-region-person-president',
            name: 'Μαρία Τσιούρβα', name_en: 'Maria Tsiourva', name_short: 'Μ. Τσιούρβα', name_short_en: 'M. Tsiourva',
            roles: [{ key: 'council', ...councilSeat, isHead: true }, { key: 'party', ...inParty }],
        },
        {
            id: 'seed-region-person-councillor',
            name: 'Γιώργος Λιάπης', name_en: 'Giorgos Liapis', name_short: 'Γ. Λιάπης', name_short_en: 'G. Liapis',
            roles: [
                { key: 'council', ...councilSeat },
                { key: 'party', ...inParty },
                { key: 'committee', administrativeBodyId: 'seed-region-committee' },
            ],
        },
        {
            id: 'seed-region-person-independent',
            name: 'Κατερίνα Ντόβα', name_en: 'Katerina Ntova', name_short: 'Κ. Ντόβα', name_short_en: 'K. Ntova',
            // A council seat and no party: an independent regional councillor.
            roles: [{ key: 'council', ...councilSeat }],
        },
    ]
    for (const { id, roles, ...person } of persons) {
        await db.person.upsert({ where: { id }, update: { ...person, cityId }, create: { id, ...person, cityId } })
        for (const { key, ...role } of roles) {
            const roleId = `seed-region-role-${key}-${id}`
            await db.role.upsert({ where: { id: roleId }, update: role, create: { id: roleId, personId: id, ...role } })
        }
    }

    const meetings = [
        { id: MEETING_ID, dateTime: new Date('2026-09-21T15:00:00+03:00'), sessionNumber: 9, administrativeBodyId: 'seed-region-council' },
        { id: COMMITTEE_MEETING_ID, dateTime: new Date('2026-09-28T12:00:00+03:00'), sessionNumber: 31, administrativeBodyId: 'seed-region-committee' },
    ]
    for (const { id, ...meeting } of meetings) {
        const data = { ...meeting, kind: 'ordinary' as const, released: true }
        await db.councilMeeting.upsert({ where: { cityId_id: { cityId, id } }, update: data, create: { cityId, id, ...data } })
    }

    const topics = await db.topic.findMany({
        where: { realm: 'greece', deprecated: false }, orderBy: { id: 'asc' }, take: 2, select: { id: true },
    })
    const topicId = (index: number): string | null => topics[index % Math.max(topics.length, 1)]?.id ?? null

    const segments = [
        {
            id: 'seed-region-seg-1',
            personId: 'seed-region-person-governor',
            label: 'Ελένη Καρανίκα',
            startTimestamp: 0,
            endTimestamp: 90,
            summary: 'Η Περιφερειάρχης παρουσίασε το πρόγραμμα αντιπλημμυρικών έργων στον Πηνειό και ζήτησε την έγκριση της χρηματοδότησης.',
            utterances: [
                'Κυρίες και κύριοι σύμβουλοι, το πρώτο θέμα είναι τα αντιπλημμυρικά έργα στον Πηνειό, στο ύψος της Λάρισας.',
                'Το έργο περιλαμβάνει την ενίσχυση των αναχωμάτων και τον καθαρισμό της κοίτης.',
                'Ζητώ από το Περιφερειακό Συμβούλιο να εγκρίνει τη χρηματοδότηση.',
            ],
        },
        {
            id: 'seed-region-seg-2',
            personId: 'seed-region-person-independent',
            label: 'Κατερίνα Ντόβα',
            startTimestamp: 90,
            endTimestamp: 180,
            summary: 'Η σύμβουλος Ντόβα ζήτησε χρονοδιάγραμμα για τα έργα στο λιμάνι της Σκιάθου πριν από την επόμενη τουριστική περίοδο.',
            utterances: [
                'Ευχαριστώ, κυρία Πρόεδρε.',
                'Τα έργα στο λιμάνι της Σκιάθου καθυστερούν εδώ και δύο χρόνια.',
                'Ζητώ δεσμευτικό χρονοδιάγραμμα πριν από την επόμενη τουριστική περίοδο.',
            ],
        },
    ]
    for (const [index, seg] of segments.entries()) {
        const tagId = `seed-region-tag-${seg.id}`
        await db.speakerTag.upsert({
            where: { id: tagId },
            update: { label: seg.label, personId: seg.personId },
            create: { id: tagId, label: seg.label, personId: seg.personId },
        })
        await db.speakerSegment.upsert({
            where: { id: seg.id },
            update: {},
            create: {
                id: seg.id, cityId, meetingId: MEETING_ID, speakerTagId: tagId,
                startTimestamp: seg.startTimestamp, endTimestamp: seg.endTimestamp,
            },
        })
        await db.summary.upsert({
            where: { speakerSegmentId: seg.id },
            update: { text: seg.summary },
            create: { speakerSegmentId: seg.id, text: seg.summary, type: 'substantive' },
        })
        const segmentTopic = topicId(index)
        if (segmentTopic) {
            await db.topicLabel.upsert({
                where: { id: `seed-region-label-${seg.id}` },
                update: {},
                create: { id: `seed-region-label-${seg.id}`, speakerSegmentId: seg.id, topicId: segmentTopic },
            })
        }
        const utteranceLength = (seg.endTimestamp - seg.startTimestamp) / seg.utterances.length
        for (const [i, text] of seg.utterances.entries()) {
            await db.utterance.upsert({
                where: { id: `${seg.id}-utt-${i}` },
                update: { text },
                create: {
                    id: `${seg.id}-utt-${i}`,
                    speakerSegmentId: seg.id,
                    text,
                    startTimestamp: seg.startTimestamp + i * utteranceLength,
                    endTimestamp: seg.startTimestamp + (i + 1) * utteranceLength,
                },
            })
        }
    }

    // One subject on the mainland and one on an island: each is in another
    // polygon of the outline.
    const subjects = [
        {
            id: 'seed-region-subj-pineios',
            name: 'Αντιπλημμυρικά έργα στον Πηνειό',
            description: 'Έγκριση χρηματοδότησης για την ενίσχυση των αναχωμάτων και τον καθαρισμό της κοίτης του Πηνειού στο ύψος της Λάρισας.',
            agendaItemIndex: 1,
            personId: 'seed-region-person-governor',
            location: { id: 'seed-region-loc-pineios', text: 'Πηνειός, Λάρισα', lng: 22.4191, lat: 39.6390 },
        },
        {
            id: 'seed-region-subj-skiathos',
            name: 'Έργα στο λιμάνι της Σκιάθου',
            description: 'Χρονοδιάγραμμα και ανάθεση των έργων επέκτασης του λιμανιού της Σκιάθου.',
            agendaItemIndex: 2,
            personId: 'seed-region-person-deputy',
            location: { id: 'seed-region-loc-skiathos', text: 'Λιμάνι Σκιάθου', lng: 23.4900, lat: 39.1630 },
        },
    ]
    for (const [index, { id, location, ...subject }] of subjects.entries()) {
        await db.$executeRaw`
            INSERT INTO "Location" (id, type, text, coordinates)
            VALUES (${location.id}, 'point'::"LocationType", ${location.text}, ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326))
            ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, coordinates = EXCLUDED.coordinates`
        const data = { ...subject, topicId: topicId(index), locationId: location.id }
        await db.subject.upsert({ where: { id }, update: data, create: { id, cityId, councilMeetingId: MEETING_ID, ...data } })
    }

    log('Region review fixture seeded.')
}
