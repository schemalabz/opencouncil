/** @jest-environment node */

import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { isReviewerAssignment } from '@/lib/speakerIdentifications'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createPerson } from '../helpers/factories'

const MIGRATION_PATH = path.join(__dirname, '../../prisma/migrations/20261002120000_add_speaker_identifications/migration.sql')

/** The migration's backfill: its last statement, replayed on tags shaped like the ones production holds. */
function backfillStatement(): string {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
    const start = sql.lastIndexOf('UPDATE "SpeakerTag"')
    if (start === -1) throw new Error('The migration has no SpeakerTag backfill')
    return sql.slice(start)
}

const IMPORTED_AT = new Date('2026-03-01T10:00:00Z')
const secondsLater = (seconds: number) => new Date(IMPORTED_AT.getTime() + seconds * 1000)

describe('speaker identifications migration: backfill', () => {
    let personId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        const city = await createCity({ id: 'c1' })
        personId = (await createPerson(city.id, { name: 'Speaker' })).id
    })

    /** A tag as it was before the migration: no source recorded, and the given write times. */
    async function tagBefore(label: string, { person = false, editedAfter = 0 }: { person?: boolean; editedAfter?: number } = {}) {
        const tag = await prisma.speakerTag.create({
            data: { label, personId: person ? personId : null, createdAt: IMPORTED_AT, updatedAt: secondsLater(editedAfter) },
        })
        return tag.id
    }

    test('marks every tag a reviewer edited, and only those', async () => {
        const tags = {
            // The import: one write per tag, never an update.
            unmatched: await tagBefore('Άγνωστος Ομιλητής 1'),
            voiceprintMatch: await tagBefore('SPEAKER_3', { person: true }),
            // The import's own clock, within the slack.
            unmatchedSlowImport: await tagBefore('Άγνωστος Ομιλητής 2', { editedAfter: 2 }),
            // A reviewer's edits, each of which moves updatedAt.
            personChanged: await tagBefore('SPEAKER_4', { person: true, editedAfter: 3600 }),
            personRemoved: await tagBefore('SPEAKER_5', { editedAfter: 3600 }),
            personChosen: await tagBefore('Άγνωστος Ομιλητής 3', { person: true, editedAfter: 3600 }),
            labelTyped: await tagBefore('Κάτοικος', { editedAfter: 3600 }),
            // "This segment only": a new tag with the reviewer's person, in one write.
            splitOffWithPerson: await tagBefore('SPEAKER_3', { person: true }),
            // A segment the reviewer added or split off and left unnamed, in one write.
            createdUnnamed: await tagBefore('New speaker segment'),
        }

        await prisma.$executeRawUnsafe(backfillStatement())

        const after = new Map((await prisma.speakerTag.findMany()).map(tag => [tag.id, tag]))
        const sourceOf = (id: string) => after.get(id)?.personSetBy
        const isProtected = (id: string) => isReviewerAssignment(after.get(id)!)

        expect(Object.fromEntries(Object.entries(tags).map(([name, id]) => [name, sourceOf(id)]))).toEqual({
            unmatched: null,
            voiceprintMatch: null,
            unmatchedSlowImport: null,
            personChanged: 'user',
            personRemoved: 'user',
            personChosen: 'user',
            labelTyped: 'user',
            splitOffWithPerson: null,
            createdUnnamed: null,
        })

        // With the per-tag rule, every edit and every name is protected. What stays open
        // to an automatic pass is a speaker nobody edited and nobody named.
        expect(Object.fromEntries(Object.entries(tags).map(([name, id]) => [name, isProtected(id)]))).toEqual({
            unmatched: false,
            voiceprintMatch: true,
            unmatchedSlowImport: false,
            personChanged: true,
            personRemoved: true,
            personChosen: true,
            labelTyped: true,
            splitOffWithPerson: true,
            createdUnnamed: false,
        })
    })

    test('changes no name and no timestamp, and creates no identification', async () => {
        const id = await tagBefore('SPEAKER_4', { person: true, editedAfter: 3600 })

        await prisma.$executeRawUnsafe(backfillStatement())

        const tag = await prisma.speakerTag.findUniqueOrThrow({ where: { id } })
        expect(tag).toMatchObject({ label: 'SPEAKER_4', personId, createdAt: IMPORTED_AT, updatedAt: secondsLater(3600) })
        expect(await prisma.speakerIdentification.count()).toBe(0)
    })
})
