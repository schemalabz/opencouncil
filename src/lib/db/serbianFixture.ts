import type { PrismaClient } from '@prisma/client';
// No `server-only`: `npm run seed` imports this module through tsx, outside Next.js.

/**
 * Serbian review fixture: a small Belgrade dataset for exercising the serbia
 * realm (Cyrillic/Latin transliteration, sr / sr-Latn locales, realm-scoped
 * topics). Production has no Serbian content, so the seed artifact cannot carry
 * it: `seed setup`, `seed reset`, and `seed fixtures` add it to a local database,
 * and prisma/seed.ts adds it to a preview. All rows use fixed `seed-sr-*` ids and
 * upserts, so a second run changes nothing.
 *
 * One speaker segment is stored in Cyrillic and one in Latin on purpose:
 * transcripts arrive in either script, and rendering normalizes to the view's
 * script (`toScript`), so the fixture exercises both directions.
 */
export async function ensureSerbianFixture(db: PrismaClient, log: (line: string) => void = () => {}): Promise<void> {
    log('Seeding Serbian review fixture (beograd)...')

    const city = {
        name: 'Београд',
        name_en: 'Belgrade',
        name_municipality: 'Град Београд',
        name_municipality_en: 'City of Belgrade',
        timezone: 'Europe/Belgrade',
        // The demo city: published on opencouncil.rs without claiming official
        // support, which is what this whole status exists for.
        status: 'demo' as const,
        authorityType: 'municipality' as const,
        language: 'sr' as const,
        realm: 'serbia' as const,
        population: 1197714,
    }
    await db.city.upsert({ where: { id: 'beograd' }, update: city, create: { id: 'beograd', ...city } })

    const body = {
        name: 'Скупштина града Београда',
        name_en: 'City Assembly of Belgrade',
        type: 'council' as const,
        cityId: 'beograd',
    }
    await db.administrativeBody.upsert({
        where: { id: 'seed-sr-skupstina' },
        update: body,
        create: { id: 'seed-sr-skupstina', ...body },
    })

    const topics = [
        { id: 'seed-sr-topic-saobracaj', name: 'Саобраћај', name_en: 'Transport', colorHex: '#2563eb' },
        { id: 'seed-sr-topic-urbanizam', name: 'Урбанизам', name_en: 'Urban Planning', colorHex: '#d97706' },
        { id: 'seed-sr-topic-zivotna-sredina', name: 'Животна средина', name_en: 'Environment', colorHex: '#16a34a' },
    ]
    for (const { id, ...topic } of topics) {
        await db.topic.upsert({
            where: { id },
            update: { ...topic, realm: 'serbia' },
            create: { id, ...topic, realm: 'serbia' },
        })
    }

    // Fictional party and people — review data, not real Belgrade politics.
    const party = {
        name: 'Грађанска листа',
        name_en: 'Civic List',
        name_short: 'ГЛ',
        name_short_en: 'CL',
        colorHex: '#7c3aed',
        cityId: 'beograd',
    }
    await db.party.upsert({ where: { id: 'seed-sr-party-gl' }, update: party, create: { id: 'seed-sr-party-gl', ...party } })

    const persons = [
        {
            id: 'seed-sr-person-jovanovic',
            name: 'Милица Јовановић',
            name_en: 'Milica Jovanović',
            name_short: 'М. Јовановић',
            name_short_en: 'M. Jovanović',
        },
        {
            id: 'seed-sr-person-petrovic',
            name: 'Марко Петровић',
            name_en: 'Marko Petrović',
            name_short: 'М. Петровић',
            name_short_en: 'M. Petrović',
        },
    ]
    for (const { id, ...person } of persons) {
        await db.person.upsert({
            where: { id },
            update: { ...person, cityId: 'beograd' },
            create: { id, ...person, cityId: 'beograd' },
        })
        await db.role.upsert({
            where: { id: `seed-sr-role-${id}` },
            update: {},
            create: {
                id: `seed-sr-role-${id}`,
                personId: id,
                cityId: 'beograd',
                name: 'Одборник',
                name_en: 'Councillor',
            },
        })
        await db.role.upsert({
            where: { id: `seed-sr-role-party-${id}` },
            update: {},
            create: { id: `seed-sr-role-party-${id}`, personId: id, partyId: 'seed-sr-party-gl' },
        })
    }

    const meeting = {
        name: 'Седница Скупштине града Београда',
        name_en: 'Session of the City Assembly of Belgrade',
        dateTime: new Date('2026-06-15T10:00:00+02:00'),
        released: true,
        administrativeBodyId: 'seed-sr-skupstina',
    }
    await db.councilMeeting.upsert({
        where: { cityId_id: { cityId: 'beograd', id: 'seed-sr-jun-2026' } },
        update: meeting,
        create: { cityId: 'beograd', id: 'seed-sr-jun-2026', ...meeting },
    })

    // Segment 1: stored in Cyrillic. Segment 2: stored in Latin.
    const segments = [
        {
            id: 'seed-sr-seg-1',
            personId: 'seed-sr-person-jovanovic',
            label: 'Милица Јовановић',
            startTimestamp: 0,
            endTimestamp: 90,
            topicId: 'seed-sr-topic-saobracaj',
            summary:
                'Одборница Јовановић представила је предлог измене режима саобраћаја у центру града, са нагласком на проширење пешачких зона и нове бициклистичке стазе.',
            utterances: [
                'Поштоване колеге, на дневном реду је предлог одлуке о измени режима саобраћаја у центру града.',
                'Предлог обухвата проширење пешачке зоне у Кнез Михаиловој улици и изградњу нових бициклистичких стаза.',
                'Молим да размотримо и примедбе грађана достављене током јавне расправе.',
            ],
        },
        {
            id: 'seed-sr-seg-2',
            personId: 'seed-sr-person-petrovic',
            label: 'Марко Петровић',
            startTimestamp: 90,
            endTimestamp: 180,
            topicId: 'seed-sr-topic-zivotna-sredina',
            summary:
                'Odbornik Petrović je govorio o uređenju zelenih površina na Novom Beogradu i predložio sadnju novih stabala duž Bulevara Mihajla Pupina.',
            utterances: [
                'Zahvaljujem se koleginici Jovanović na iscrpnom izlaganju.',
                'Predlažem da se u plan uvrsti i uređenje zelenih površina na Novom Beogradu.',
                'Sadnja novih stabala duž Bulevara Mihajla Pupina značajno bi poboljšala kvalitet vazduha.',
            ],
        },
    ]
    for (const seg of segments) {
        await db.speakerTag.upsert({
            where: { id: `seed-sr-tag-${seg.id}` },
            update: { label: seg.label, personId: seg.personId },
            create: { id: `seed-sr-tag-${seg.id}`, label: seg.label, personId: seg.personId },
        })
        await db.speakerSegment.upsert({
            where: { id: seg.id },
            update: {},
            create: {
                id: seg.id,
                cityId: 'beograd',
                meetingId: 'seed-sr-jun-2026',
                speakerTagId: `seed-sr-tag-${seg.id}`,
                startTimestamp: seg.startTimestamp,
                endTimestamp: seg.endTimestamp,
            },
        })
        await db.summary.upsert({
            where: { speakerSegmentId: seg.id },
            update: { text: seg.summary },
            create: { speakerSegmentId: seg.id, text: seg.summary, type: 'substantive' },
        })
        await db.topicLabel.upsert({
            where: { id: `seed-sr-label-${seg.id}` },
            update: {},
            create: { id: `seed-sr-label-${seg.id}`, speakerSegmentId: seg.id, topicId: seg.topicId },
        })
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

    const subjects = [
        {
            id: 'seed-sr-subj-saobracaj',
            name: 'Измена режима саобраћаја у центру града',
            description:
                'Предлог одлуке о измени режима саобраћаја у центру града: проширење пешачке зоне у Кнез Михаиловој улици, нове бициклистичке стазе и измене траса линија јавног превоза.',
            agendaItemIndex: 1,
            topicId: 'seed-sr-topic-saobracaj',
            personId: 'seed-sr-person-jovanovic',
        },
        {
            id: 'seed-sr-subj-zelenilo',
            name: 'Уређење зелених површина на Новом Београду',
            description:
                'Предлог програма уређења зелених површина на Новом Београду, укључујући садњу нових стабала дуж Булевара Михајла Пупина.',
            agendaItemIndex: 2,
            topicId: 'seed-sr-topic-zivotna-sredina',
            personId: 'seed-sr-person-petrovic',
        },
    ]
    for (const { id, ...subject } of subjects) {
        await db.subject.upsert({
            where: { id },
            update: subject,
            create: { id, cityId: 'beograd', councilMeetingId: 'seed-sr-jun-2026', ...subject },
        })
    }

    log('Serbian review fixture seeded.')
}
