/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import {
    createMeetingRecord,
    deleteMeetingRecord,
    originalScheduledDate,
    setMeetingReleased,
    updateMeetingRecord,
} from '@/lib/db/meetingLifecycle'
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting } from '../helpers/factories'

const CITY = 'c1'
const MARCH = (day: number) => new Date(Date.UTC(2026, 2, day, 16))

async function released(id: string) {
    const row = await prisma.councilMeeting.findUniqueOrThrow({ where: { cityId_id: { cityId: CITY, id } }, select: { released: true } })
    return row.released
}

async function visibility(...ids: string[]) {
    return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await released(id)])))
}

function ruleCode(error: unknown) {
    return error instanceof LifecycleRuleError ? error.code : String(error)
}

describe('meeting lifecycle module', () => {
    let councilId: string
    let committeeId: string

    beforeEach(async () => {
        await resetDatabase(prisma)
        await createCity({ id: CITY })
        councilId = (await createAdministrativeBody(CITY, { type: 'council' })).id
        committeeId = (await createAdministrativeBody(CITY, { type: 'committee', name: 'Committee', name_en: 'Committee' })).id
    })

    /** A postponed meeting A, released, and its new meeting B, not released yet. */
    async function postponement() {
        await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, scheduleStatus: 'postponed', released: true, kind: 'regular' })
        await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' })
    }

    describe('release', () => {
        test('releasing the new meeting unreleases the postponed one, and unreleasing it releases the postponed one again', async () => {
            await postponement()
            expect(await visibility('a', 'b')).toEqual({ a: true, b: false })

            await setMeetingReleased(CITY, 'b', true)
            expect(await visibility('a', 'b')).toEqual({ a: false, b: true })

            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b')).toEqual({ a: true, b: false })
        })

        test('the link alone changes no visibility', async () => {
            await postponement()
            expect(await visibility('a', 'b')).toEqual({ a: true, b: false })
        })

        test('is idempotent, and unreleasing a meeting that is not released publishes nothing', async () => {
            await postponement()
            await setMeetingReleased(CITY, 'b', true)
            await setMeetingReleased(CITY, 'b', true)
            expect(await visibility('a', 'b')).toEqual({ a: false, b: true })

            // An admin hides A by hand while B is a draft; B stays a draft.
            await setMeetingReleased(CITY, 'b', false)
            await setMeetingReleased(CITY, 'a', false)
            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b')).toEqual({ a: false, b: false })
        })

        test('in a chain A → B → C, releasing C hides A and B, and an earlier meeting cannot be released', async () => {
            await postponement()
            await updateMeetingRecord(CITY, 'b', { scheduleStatus: 'postponed' })
            await createMeetingRecord({ cityId: CITY, id: 'c', dateTime: MARCH(26), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'b' })
            await setMeetingReleased(CITY, 'b', true)
            await setMeetingReleased(CITY, 'c', true)
            expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: false, c: true })

            // B is not released, so unreleasing it is no transition: A stays hidden.
            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: false, c: true })

            await expect(setMeetingReleased(CITY, 'a', true)).rejects.toMatchObject({ code: 'laterMeetingReleased' })
            expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: false, c: true })

            // Unreleasing C releases B, its direct predecessor.
            await setMeetingReleased(CITY, 'c', false)
            expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: true, c: false })
        })

        test('a postponed draft stays a draft when its new meeting stops being public', async () => {
            await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, scheduleStatus: 'postponed', released: false, kind: 'regular' })
            await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' })
            await setMeetingReleased(CITY, 'b', true)
            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b')).toEqual({ a: false, b: false })

            // The same through a delete and through a relink.
            await setMeetingReleased(CITY, 'b', true)
            await deleteMeetingRecord(CITY, 'b')
            expect(await visibility('a')).toEqual({ a: false })

            await createMeeting(CITY, { id: 'z', dateTime: MARCH(11), administrativeBodyId: councilId, scheduleStatus: 'postponed', released: false, kind: 'regular' })
            await createMeetingRecord({ cityId: CITY, id: 'c', dateTime: MARCH(20), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a', released: true })
            await updateMeetingRecord(CITY, 'c', { postponedFromId: 'z' })
            expect(await visibility('a', 'z', 'c')).toEqual({ a: false, z: false, c: true })
        })

        test('a draft in the middle of a chain: unreleasing or deleting C brings A back', async () => {
            // A is public, B was postponed again while still a draft (a meeting made
            // through MCP starts as a draft), C is the meeting that happens.
            for (const end of ['unrelease', 'delete'] as const) {
                await resetDatabase(prisma)
                await createCity({ id: CITY })
                councilId = (await createAdministrativeBody(CITY, { type: 'council' })).id
                await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', scheduleStatus: 'postponed', released: true })
                await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' })
                await updateMeetingRecord(CITY, 'b', { scheduleStatus: 'postponed' })
                await createMeetingRecord({ cityId: CITY, id: 'c', dateTime: MARCH(26), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'b' })
                await setMeetingReleased(CITY, 'c', true)
                expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: false, c: true })

                if (end === 'unrelease') {
                    await setMeetingReleased(CITY, 'c', false)
                    expect(await visibility('a', 'b', 'c')).toEqual({ a: true, b: false, c: false })
                } else {
                    await deleteMeetingRecord(CITY, 'c')
                    expect(await visibility('a', 'b')).toEqual({ a: true, b: false })
                }
            }
        })

        test('an admin who releases a hidden meeting by hand clears the memory of the hide', async () => {
            await postponement()
            await setMeetingReleased(CITY, 'b', true)
            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b')).toEqual({ a: true, b: false })
            // A was public before, so B hid it and unhid it. Now the admin hides
            // A by hand: a later release and unrelease of B leaves it hidden.
            await setMeetingReleased(CITY, 'a', false)
            await setMeetingReleased(CITY, 'b', true)
            await setMeetingReleased(CITY, 'b', false)
            expect(await visibility('a', 'b')).toEqual({ a: false, b: false })
        })

        test('shows the date of the first meeting of the chain as the original date', async () => {
            await postponement()
            await updateMeetingRecord(CITY, 'b', { scheduleStatus: 'postponed' })
            await createMeetingRecord({ cityId: CITY, id: 'c', dateTime: MARCH(26), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'b' })
            expect(await originalScheduledDate(CITY, 'c')).toEqual(MARCH(12))
            expect(await originalScheduledDate(CITY, 'b')).toEqual(MARCH(12))
            expect(await originalScheduledDate(CITY, 'a')).toBeNull()
        })
    })

    describe('delete', () => {
        test('deleting the released new meeting releases the postponed one again', async () => {
            await postponement()
            await setMeetingReleased(CITY, 'b', true)
            await deleteMeetingRecord(CITY, 'b')
            expect(await visibility('a')).toEqual({ a: true })
        })

        test('deleting a draft publishes nothing', async () => {
            await postponement()
            await setMeetingReleased(CITY, 'a', false)
            await deleteMeetingRecord(CITY, 'b')
            expect(await visibility('a')).toEqual({ a: false })
        })

        test('refuses to delete a meeting that another meeting links to', async () => {
            await postponement()
            await expect(deleteMeetingRecord(CITY, 'a')).rejects.toMatchObject({ code: 'hasDependents' })
            expect(await visibility('a', 'b')).toEqual({ a: true, b: false })
        })
    })

    describe('links', () => {
        test('refuses a cycle', async () => {
            await postponement()
            await updateMeetingRecord(CITY, 'b', { scheduleStatus: 'postponed' })
            const error = await updateMeetingRecord(CITY, 'a', { postponedFromId: 'b' }).catch((e) => e)
            expect(ruleCode(error)).toBe('postponementCycle')
        })

        test('a postponed meeting takes one new meeting only', async () => {
            await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', scheduleStatus: 'postponed' })
            await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' })
            const second = await createMeetingRecord({ cityId: CITY, id: 'b2', dateTime: MARCH(20), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' }).catch((e) => e)
            expect(ruleCode(second)).toBe('postponedFromTaken')
            await createMeeting(CITY, { id: 'c', dateTime: MARCH(21), administrativeBodyId: councilId, kind: 'regular' })
            const relink = await updateMeetingRecord(CITY, 'c', { postponedFromId: 'a' }).catch((e) => e)
            expect(ruleCode(relink)).toBe('postponedFromTaken')
            // The new meeting itself can save again with its own link.
            await expect(updateMeetingRecord(CITY, 'b', { sessionNumber: 4 })).resolves.toBeDefined()
        })

        test('refuses a link to a meeting that is not postponed, or of another body', async () => {
            await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular' })
            const notPostponed = await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'a' }).catch((e) => e)
            expect(ruleCode(notPostponed)).toBe('postponedFromNotPostponed')

            await updateMeetingRecord(CITY, 'a', { scheduleStatus: 'postponed' })
            const otherBody = await createMeetingRecord({ cityId: CITY, id: 'b', dateTime: MARCH(19), administrativeBodyId: committeeId, kind: 'regular', postponedFromId: 'a' }).catch((e) => e)
            expect(ruleCode(otherBody)).toBe('postponedFromOtherBody')
            expect(await prisma.councilMeeting.count({ where: { cityId: CITY } })).toBe(1)
        })

        test('refuses to move a linked meeting to another body', async () => {
            await postponement()
            const error = await updateMeetingRecord(CITY, 'b', { administrativeBodyId: committeeId }).catch((e) => e)
            expect(ruleCode(error)).toBe('postponedFromOtherBody')
        })

        test('refuses to change the status of a postponed meeting that has its new meeting', async () => {
            await postponement()
            const error = await updateMeetingRecord(CITY, 'a', { scheduleStatus: 'scheduled' }).catch((e) => e)
            expect(ruleCode(error)).toBe('postponedMeetingIsLinked')
        })

        test('linking a released meeting hides the whole chain before it, and unlinking releases the predecessor again', async () => {
            await postponement()
            await updateMeetingRecord(CITY, 'b', { scheduleStatus: 'postponed' })
            await setMeetingReleased(CITY, 'b', true)
            // X is a released meeting that the admin links to B later.
            await createMeeting(CITY, { id: 'x', dateTime: MARCH(26), administrativeBodyId: councilId, kind: 'regular', released: true })
            // An admin released A again by hand, outside the module.
            await prisma.councilMeeting.update({ where: { cityId_id: { cityId: CITY, id: 'a' } }, data: { released: true } })

            await updateMeetingRecord(CITY, 'x', { postponedFromId: 'b' })
            expect(await visibility('a', 'b', 'x')).toEqual({ a: false, b: false, x: true })

            await updateMeetingRecord(CITY, 'x', { postponedFromId: null })
            expect(await visibility('a', 'b', 'x')).toEqual({ a: false, b: true, x: true })
        })

        test('linking a hidden meeting whose later meeting is public hides the new predecessor too', async () => {
            // B → C with C public, and A a public postponed meeting that the admin links in front of B.
            await createMeeting(CITY, { id: 'b', dateTime: MARCH(19), administrativeBodyId: councilId, kind: 'regular', scheduleStatus: 'postponed', released: true })
            await createMeetingRecord({ cityId: CITY, id: 'c', dateTime: MARCH(26), administrativeBodyId: councilId, kind: 'regular', postponedFromId: 'b' })
            await setMeetingReleased(CITY, 'c', true)
            await createMeeting(CITY, { id: 'a', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', scheduleStatus: 'postponed', released: true })
            expect(await visibility('a', 'b', 'c')).toEqual({ a: true, b: false, c: true })

            await updateMeetingRecord(CITY, 'b', { postponedFromId: 'a' })
            expect(await visibility('a', 'b', 'c')).toEqual({ a: false, b: false, c: true })

            // Unlinking B again shows A: no later meeting of its chain is public any more.
            await updateMeetingRecord(CITY, 'b', { postponedFromId: null })
            expect(await visibility('a', 'b', 'c')).toEqual({ a: true, b: false, c: true })
        })

        test('keeps λογοδοσία for the council', async () => {
            await createMeeting(CITY, { id: 'm', dateTime: MARCH(12), administrativeBodyId: committeeId, kind: 'regular' })
            const error = await updateMeetingRecord(CITY, 'm', { kind: 'accountability' }).catch((e) => e)
            expect(ruleCode(error)).toBe('councilOnlyKind')
            await createMeeting(CITY, { id: 'n', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular' })
            await expect(updateMeetingRecord(CITY, 'n', { kind: 'accountability' })).resolves.toMatchObject({ kind: 'accountability' })
        })

        test('keeps a continuation in one body, after its first part', async () => {
            await createMeeting(CITY, { id: 'first', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', sessionNumber: 7 })
            await createMeetingRecord({ cityId: CITY, id: 'part', dateTime: MARCH(13), administrativeBodyId: councilId, kind: null, continuationOfId: 'first' })
            const moved = await updateMeetingRecord(CITY, 'first', { dateTime: MARCH(14) }).catch((e) => e)
            expect(ruleCode(moved)).toBe('partsNotLater')
        })
    })

    test('a scheduled meeting that becomes postponed or cancelled keeps its visibility', async () => {
        await createMeeting(CITY, { id: 'm', dateTime: MARCH(12), administrativeBodyId: councilId, kind: 'regular', released: true })
        await updateMeetingRecord(CITY, 'm', { scheduleStatus: 'cancelled', scheduleStatusReason: 'Λόγω απεργίας' })
        expect(await visibility('m')).toEqual({ m: true })
    })
})
