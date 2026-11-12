/** @jest-environment node */

jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: jest.fn() }))

import { VoicePrintConsentSource } from '@prisma/client'
import type { StartedTestContainer } from 'testcontainers'
import prisma from '@/lib/db/prisma'
import { env } from '@/env.mjs'
import { s3Client } from '@/lib/s3'
import { sendErrorAdminAlert } from '@/lib/discord-core'
import { recordVoicePrintConsent } from '@/lib/db/personConsent'
import { claimPerson } from '@/lib/db/personClaim'
import { deletePerson } from '@/lib/db/people'
import { deleteCity } from '@/lib/db/cities'
import {
    deleteVoiceDataWithoutConsent,
    deleteVoicePrintById,
    planVoiceDataDeletion,
    runVoiceDataDeletion,
} from '@/lib/db/voiceprintsDelete'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createPerson, createSpeakerSegment, createSpeakerTag, createUser, signInAsSuperAdmin } from '../helpers/factories'
import { createBucket, deleteObject, keysIn, putObject, routeToMock, startS3Mock } from '../helpers/s3'

/**
 * The deletion of voice data against a real database and a real S3 server:
 * which rows and which clips each path deletes, and which it keeps.
 *
 * The app's bucket is the env mock's test-bucket, behind the CDN URL
 * https://example.com. task-bucket stands in for the task server's bucket,
 * which a voiceprint URL names on a preview. No request can reach a real
 * bucket: see routeToMock.
 */

const APP_BUCKET = 'test-bucket'
const TASK_BUCKET = 'task-bucket'

let s3: StartedTestContainer | undefined

beforeAll(async () => {
    expect(env.DO_SPACES_ENDPOINT).toBe('https://example.com')
    expect(env.DO_SPACES_BUCKET).toBe(APP_BUCKET)
    const mock = await startS3Mock()
    s3 = mock.container
    routeToMock(s3Client, mock)
    await createBucket(s3Client, APP_BUCKET)
    await createBucket(s3Client, TASK_BUCKET)
}, 180_000)

afterAll(async () => {
    delete process.env.DEPLOYMENT_ENV
    await s3?.stop()
})

const clipKey = (cityId: string, personId: string, name: string) => `voiceprints/${cityId}/${personId}/${name}_v1.mp3`
const cdnUrl = (key: string) => `https://example.com/${key}`
const originUrl = (bucket: string, key: string) => `https://${bucket}.fra1.digitaloceanspaces.com/${key}`

/** The keys in both buckets, as `bucket/key`. */
async function allClips(): Promise<string[]> {
    const app = (await keysIn(s3Client, APP_BUCKET)).map((key) => `${APP_BUCKET}/${key}`)
    const task = (await keysIn(s3Client, TASK_BUCKET)).map((key) => `${TASK_BUCKET}/${key}`)
    return [...app, ...task].sort()
}

async function emptyBuckets() {
    for (const bucket of [APP_BUCKET, TASK_BUCKET]) {
        for (const key of await keysIn(s3Client, bucket)) await deleteObject(s3Client, bucket, key)
    }
}

describe('voice data deletion', () => {
    let segmentId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        await emptyBuckets()
        delete process.env.DEPLOYMENT_ENV
        jest.mocked(sendErrorAdminAlert).mockClear()

        await createCity({ id: 'c1' })
        await createCity({ id: 'c2', name: 'Other City', name_en: 'Other City' })
        await createMeeting('c1', { id: 'm1' })
        const tag = await createSpeakerTag()
        segmentId = (await createSpeakerSegment('m1', 'c1', { speakerTagId: tag.id })).id
    })

    /** A voiceprint row for the person, and the clip that it names, uploaded. */
    async function voiceprint(personId: string, { bucket = APP_BUCKET, viaCdn = true, cityId = 'c1', name = 'a' } = {}) {
        const key = clipKey(cityId, personId, name)
        await putObject(s3Client, bucket, key)
        return prisma.voicePrint.create({
            data: {
                personId,
                sourceSegmentId: segmentId,
                embedding: '[0.1]',
                sourceAudioUrl: viaCdn ? cdnUrl(key) : originUrl(bucket, key),
                startTimestamp: 0,
                endTimestamp: 30,
            },
        })
    }

    const consent = (personId: string, data: { userId?: string | null; source?: VoicePrintConsentSource } = {}) =>
        prisma.voicePrintConsent.create({ data: { personId, ...data } })

    const rowsOf = async (personId: string) => (await prisma.voicePrint.findMany({ where: { personId } })).length

    describe('a withdrawal', () => {
        let withdrawn: string
        let kept: string

        beforeEach(async () => {
            withdrawn = (await createPerson('c1', { name: 'Withdrawn' })).id
            kept = (await createPerson('c1', { name: 'Kept' })).id
            await consent(withdrawn)
            await consent(kept)
            // The row names a clip behind the CDN. The task server also left a
            // clip that no row names, in the folder of a meeting of another
            // city, in its own bucket.
            await voiceprint(withdrawn)
            await putObject(s3Client, TASK_BUCKET, clipKey('c2', withdrawn, 'earlier'))
            // The other person's row names the task bucket, so that bucket is listed.
            await voiceprint(kept, { bucket: TASK_BUCKET, viaCdn: false })
            await putObject(s3Client, APP_BUCKET, clipKey('c1', kept, 'b'))
            // Not the shape of a clip key: no person owns it.
            await putObject(s3Client, APP_BUCKET, 'voiceprints/notes.txt')
            await signInAsSuperAdmin()
        })

        test('on production, deletes the rows and every clip in the folders of that person only', async () => {
            process.env.DEPLOYMENT_ENV = 'production'

            await recordVoicePrintConsent(withdrawn, false)

            expect(await rowsOf(withdrawn)).toBe(0)
            expect(await rowsOf(kept)).toBe(1)
            expect(await allClips()).toEqual([
                `${APP_BUCKET}/${clipKey('c1', kept, 'b')}`,
                `${APP_BUCKET}/voiceprints/notes.txt`,
                `${TASK_BUCKET}/${clipKey('c1', kept, 'a')}`,
            ].sort())
            expect(await prisma.voicePrintConsent.count({ where: { personId: withdrawn, withdrawnAt: { not: null } } })).toBe(1)
            expect(sendErrorAdminAlert).not.toHaveBeenCalled()
        })

        test('elsewhere, deletes the rows and leaves every clip in place', async () => {
            const before = await allClips()

            await recordVoicePrintConsent(withdrawn, false)

            expect(await rowsOf(withdrawn)).toBe(0)
            expect(await rowsOf(kept)).toBe(1)
            expect(await allClips()).toEqual(before)
        })
    })

    test('the cleanup: a plan reads only, and a consent given after the plan keeps its voice data', async () => {
        process.env.DEPLOYMENT_ENV = 'production'
        const consented = (await createPerson('c1', { name: 'Consented' })).id
        const without = (await createPerson('c1', { name: 'Without' })).id
        const late = (await createPerson('c1', { name: 'Late' })).id
        const unlisted = (await createPerson('c1', { name: 'Unlisted' })).id
        await consent(consented)
        await voiceprint(consented)
        await voiceprint(without)
        await voiceprint(late)
        // A clip of a person who no longer exists, with no row.
        await putObject(s3Client, APP_BUCKET, clipKey('c1', 'gonePerson', 'a'))
        // A row whose bucket does not exist, so the listing of it fails.
        await prisma.voicePrint.create({
            data: {
                personId: unlisted,
                sourceSegmentId: segmentId,
                embedding: '[0.1]',
                sourceAudioUrl: originUrl('missing-bucket', clipKey('c1', unlisted, 'a')),
                startTimestamp: 0,
                endTimestamp: 30,
            },
        })
        const before = await allClips()

        const plan = await planVoiceDataDeletion()

        expect(plan.voicePrints.map((row) => row.person.name).sort()).toEqual(['Late', 'Unlisted', 'Without'])
        expect(plan.clips.map(({ bucket, key }) => `${bucket}/${key}`).sort()).toEqual([
            `${APP_BUCKET}/${clipKey('c1', 'gonePerson', 'a')}`,
            `${APP_BUCKET}/${clipKey('c1', late, 'a')}`,
            `${APP_BUCKET}/${clipKey('c1', without, 'a')}`,
        ].sort())
        expect(plan.listed).toBe(true)
        expect(plan.listFailures.map((failure) => failure.item)).toEqual(['missing-bucket/voiceprints/'])
        expect(await allClips()).toEqual(before)
        expect(await prisma.voicePrint.count()).toBe(4)

        await consent(late)
        expect(await runVoiceDataDeletion(plan)).toEqual([])

        expect((await prisma.voicePrint.findMany({ select: { personId: true } })).map((row) => row.personId).sort())
            .toEqual([consented, late].sort())
        expect(await allClips()).toEqual([
            `${APP_BUCKET}/${clipKey('c1', consented, 'a')}`,
            `${APP_BUCKET}/${clipKey('c1', late, 'a')}`,
        ].sort())
    })

    test('a person delete removes the clips that the cascade leaves behind, whatever the consent was', async () => {
        process.env.DEPLOYMENT_ENV = 'production'
        await signInAsSuperAdmin()
        const deleted = (await createPerson('c1', { name: 'Deleted' })).id
        const other = (await createPerson('c1', { name: 'Other' })).id
        await consent(deleted)
        await voiceprint(deleted)
        await voiceprint(other)

        await deletePerson(deleted)
        await deleteVoiceDataWithoutConsent({ personId: deleted }, 'test')

        expect(await allClips()).toEqual([`${APP_BUCKET}/${clipKey('c1', other, 'a')}`])
        expect(await rowsOf(other)).toBe(1)
    })

    test("a city delete removes the clips of the city's people, in any folder, and no one else's", async () => {
        process.env.DEPLOYMENT_ENV = 'production'
        await signInAsSuperAdmin()
        const gone = (await createPerson('c2', { name: 'Gone' })).id
        // A person of c1 without a consent: out of the scope of a delete of c2.
        const stays = (await createPerson('c1', { name: 'Stays' })).id
        // A person of c1 with a consent, whose clip was cut from a meeting of c2.
        const consented = (await createPerson('c1', { name: 'Consented' })).id
        await consent(consented)
        await putObject(s3Client, APP_BUCKET, clipKey('c2', gone, 'a'))
        // Cut from a meeting of c1, so it sits in the folder of c1.
        await putObject(s3Client, APP_BUCKET, clipKey('c1', gone, 'b'))
        await putObject(s3Client, APP_BUCKET, clipKey('c2', consented, 'c'))
        await voiceprint(stays)

        await deleteCity('c2')
        await deleteVoiceDataWithoutConsent({ cityId: 'c2' }, 'test')

        expect(await allClips()).toEqual([
            `${APP_BUCKET}/${clipKey('c1', stays, 'a')}`,
            `${APP_BUCKET}/${clipKey('c2', consented, 'c')}`,
        ].sort())
        expect(await rowsOf(stays)).toBe(1)
    })

    test('a claim closes a consent that another account gave in the app, and keeps the others', async () => {
        process.env.DEPLOYMENT_ENV = 'production'
        const claimer = await createUser('claimer@integration.test')
        const someoneElse = await createUser('someone@integration.test')
        const cases = {
            deletedAccount: { userId: null },
            otherAccount: { userId: someoneElse.id },
            ownAccount: { userId: claimer.id },
            onPaper: { userId: someoneElse.id, source: VoicePrintConsentSource.ADMIN },
        }
        const people: Record<string, string> = {}
        for (const [name, period] of Object.entries(cases)) {
            const id = (await createPerson('c1', { name })).id
            people[name] = id
            await consent(id, period)
            await voiceprint(id)
        }

        for (const id of Object.values(people)) {
            expect((await claimPerson(claimer.id, id)).status).toBe('linked')
        }

        const open = await prisma.voicePrintConsent.findMany({ where: { withdrawnAt: null }, select: { personId: true } })
        expect(open.map((period) => period.personId).sort()).toEqual([people.ownAccount, people.onPaper].sort())
        expect((await prisma.voicePrint.findMany({ select: { personId: true } })).map((row) => row.personId).sort())
            .toEqual([people.ownAccount, people.onPaper].sort())
        expect(await allClips()).toEqual([
            `${APP_BUCKET}/${clipKey('c1', people.ownAccount, 'a')}`,
            `${APP_BUCKET}/${clipKey('c1', people.onPaper, 'a')}`,
        ].sort())
    })

    test('the Delete button deletes the row and the clip that it names, never a file outside the clip folder', async () => {
        process.env.DEPLOYMENT_ENV = 'production'
        const person = (await createPerson('c1')).id
        await consent(person)
        const named = await voiceprint(person)
        await putObject(s3Client, APP_BUCKET, clipKey('c1', person, 'other'))
        await putObject(s3Client, APP_BUCKET, 'media/meeting.mp3')
        const outside = await prisma.voicePrint.create({
            data: { personId: person, sourceSegmentId: segmentId, embedding: '[0.1]', sourceAudioUrl: cdnUrl('media/meeting.mp3'), startTimestamp: 0, endTimestamp: 30 },
        })

        await deleteVoicePrintById(named.id)
        await deleteVoicePrintById(outside.id)

        expect(await rowsOf(person)).toBe(0)
        expect(await allClips()).toEqual([`${APP_BUCKET}/${clipKey('c1', person, 'other')}`, `${APP_BUCKET}/media/meeting.mp3`].sort())
    })
})
