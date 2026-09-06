/** @jest-environment node */

const TEST_USER_ID = 'test-user-find-replace'

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: jest.fn(),
    isUserAuthorizedToEdit: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockResolvedValue({ id: TEST_USER_ID }),
}))

import prisma from '@/lib/db/prisma'
import { replaceAllInUtterances } from '@/lib/db/utterance'
import { resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createUser,
    createUtterance,
} from '../helpers/factories'

describe('replaceAllInUtterances', () => {
    let cityId: string
    let meetingId: string
    let segmentId: string

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        // Audit-trail FK requires a real User row.
        await createUser('find-replace@test.local', { id: TEST_USER_ID } as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const meeting = await createMeeting(cityId, { id: 'm1' })
        meetingId = meeting.id
        const tag = await createSpeakerTag({ label: 'Speaker 1' })
        const seg = await createSpeakerSegment(meeting.id, cityId, {
            speakerTagId: tag.id, startTimestamp: 0, endTimestamp: 100,
        })
        segmentId = seg.id
    })

    test('replaces literal occurrences across multiple utterances', async () => {
        const u1 = await createUtterance(segmentId, { text: 'ο κύριος Μαυρογιώργης μίλησε', startTimestamp: 0, endTimestamp: 10 })
        const u2 = await createUtterance(segmentId, { text: 'και ο Μαυρογιώργης συνέχισε', startTimestamp: 10, endTimestamp: 20 })
        const u3 = await createUtterance(segmentId, { text: 'άλλο πρόσωπο εδώ', startTimestamp: 20, endTimestamp: 30 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'Μαυρογιώργης', 'Μαυρογεώργης', true)

        expect(result).toEqual({ utteranceCount: 2, occurrenceCount: 2 })

        const after = await prisma.utterance.findMany({
            where: { id: { in: [u1.id, u2.id, u3.id] } },
            orderBy: { startTimestamp: 'asc' },
        })
        expect(after[0].text).toBe('ο κύριος Μαυρογεώργης μίλησε')
        expect(after[0].lastModifiedBy).toBe('user')
        expect(after[1].text).toBe('και ο Μαυρογεώργης συνέχισε')
        expect(after[1].lastModifiedBy).toBe('user')
        expect(after[2].text).toBe('άλλο πρόσωπο εδώ')
        expect(after[2].lastModifiedBy).toBeNull()
    })

    test('counts multiple occurrences within a single utterance', async () => {
        await createUtterance(segmentId, { text: 'foo foo foo bar foo', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'foo', 'baz', true)

        expect(result).toEqual({ utteranceCount: 1, occurrenceCount: 4 })
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe('baz baz baz bar baz')
    })

    test('case-sensitive matching skips wrong-case occurrences', async () => {
        await createUtterance(segmentId, { text: 'Hello hello HELLO', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'hello', 'world', true)

        expect(result).toEqual({ utteranceCount: 1, occurrenceCount: 1 })
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe('Hello world HELLO')
    })

    test('case-insensitive matching replaces all variants while preserving the replacement casing', async () => {
        await createUtterance(segmentId, { text: 'Hello hello HELLO', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'hello', 'world', false)

        expect(result).toEqual({ utteranceCount: 1, occurrenceCount: 3 })
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe('world world world')
    })

    test('case-insensitive matching works on Greek text (without tonos differences)', async () => {
        // Greek upper/lower case mapping works for letters with the same accent
        // marks. Tonos-insensitive matching (e.g. matching ΚΑΛΗΜΕΡΑ against
        // καλημέρα) is intentionally out of scope — would need ICU unaccent.
        await createUtterance(segmentId, { text: 'Μαυρογιώργης μίλησε με τη ΜΑΥΡΟΓΙΏΡΓΗς', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'μαυρογιώργης', 'Μαυρογεώργης', false)

        expect(result.occurrenceCount).toBe(2)
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe('Μαυρογεώργης μίλησε με τη Μαυρογεώργης')
    })

    test('creates one UtteranceEdit audit row per changed utterance', async () => {
        const u1 = await createUtterance(segmentId, { text: 'apple pie', startTimestamp: 0, endTimestamp: 10 })
        const u2 = await createUtterance(segmentId, { text: 'apple sauce', startTimestamp: 10, endTimestamp: 20 })

        await replaceAllInUtterances(cityId, meetingId, 'apple', 'orange', true)

        const edits = await prisma.utteranceEdit.findMany({
            where: { utteranceId: { in: [u1.id, u2.id] } },
            orderBy: { utteranceId: 'asc' },
        })
        expect(edits).toHaveLength(2)
        for (const e of edits) {
            expect(e.editedBy).toBe('user')
            expect(e.userId).toBe(TEST_USER_ID)
            expect(e.beforeText).toContain('apple')
            expect(e.afterText).toContain('orange')
            expect(e.afterText).not.toContain('apple')
        }
    })

    test('no-op when no utterances contain the term', async () => {
        await createUtterance(segmentId, { text: 'nothing to see', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'xyz', 'abc', true)

        expect(result).toEqual({ utteranceCount: 0, occurrenceCount: 0 })
        const edits = await prisma.utteranceEdit.findMany()
        expect(edits).toHaveLength(0)
    })

    test('treats search term as a literal string, not a regex', async () => {
        await createUtterance(segmentId, { text: 'price is $5.00 today', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, '$5.00', '$6.00', true)

        expect(result.occurrenceCount).toBe(1)
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe('price is $6.00 today')
    })

    test.each([
        // Replacement strings containing String.replace special tokens must be
        // inserted literally — function-form replacement avoids interpretation.
        ['foo', '$&', 'one $& two'],
        ['foo', '$1', 'one $1 two'],
        ['foo', "$'", "one $' two"],
        ['foo', '$`', 'one $` two'],
        ['foo', '$$', 'one $$ two'],
        ['foo', '$5.00', 'one $5.00 two'],
    ])('replacement %s -> %s is inserted literally', async (term, replacement, expected) => {
        await createUtterance(segmentId, { text: 'one foo two', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, term, replacement, true)

        expect(result.occurrenceCount).toBe(1)
        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe(expected)
    })

    test.each([
        // Regex metacharacters in the search term must be matched literally.
        ['a.b', 'X', 'X next a-b not matched'],
        ['(test)', 'X', 'X is X here'],
        ['[x]', 'Y', 'word Y end'],
    ])('search term %s with regex metacharacters matches literally', async (term, replacement, expected) => {
        const sources: Record<string, string> = {
            'a.b': 'a.b next a-b not matched',
            '(test)': '(test) is (test) here',
            '[x]': 'word [x] end',
        }
        await createUtterance(segmentId, { text: sources[term], startTimestamp: 0, endTimestamp: 10 })

        await replaceAllInUtterances(cityId, meetingId, term, replacement, true)

        const after = await prisma.utterance.findFirst({ where: { speakerSegmentId: segmentId } })
        expect(after?.text).toBe(expected)
    })

    test('does not touch utterances from other cities', async () => {
        const otherCity = await createCity({ id: 'c2' })
        const otherMeeting = await createMeeting(otherCity.id, { id: 'm2' })
        const otherTag = await createSpeakerTag({ label: 'Other' })
        const otherSeg = await createSpeakerSegment(otherMeeting.id, otherCity.id, {
            speakerTagId: otherTag.id, startTimestamp: 0, endTimestamp: 10,
        })
        await createUtterance(otherSeg.id, { text: 'foo in other city', startTimestamp: 0, endTimestamp: 10 })
        await createUtterance(segmentId, { text: 'foo in this city', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'foo', 'bar', true)

        expect(result).toEqual({ utteranceCount: 1, occurrenceCount: 1 })
        const otherText = await prisma.utterance.findFirst({ where: { speakerSegmentId: otherSeg.id } })
        expect(otherText?.text).toBe('foo in other city')
    })

    test('does not touch utterances from other meetings in the same city', async () => {
        // Regression: previously the action scoped only by cityId and replaced
        // matches in every meeting in the city, leading to wildly inflated
        // counts vs. what the editor saw highlighted in the loaded transcript.
        const otherMeeting = await createMeeting(cityId, { id: 'm2' })
        const otherTag = await createSpeakerTag({ label: 'Other' })
        const otherSeg = await createSpeakerSegment(otherMeeting.id, cityId, {
            speakerTagId: otherTag.id, startTimestamp: 0, endTimestamp: 10,
        })
        await createUtterance(otherSeg.id, { text: 'foo foo foo in other meeting', startTimestamp: 0, endTimestamp: 10 })
        await createUtterance(segmentId, { text: 'foo in current meeting', startTimestamp: 0, endTimestamp: 10 })

        const result = await replaceAllInUtterances(cityId, meetingId, 'foo', 'bar', true)

        expect(result).toEqual({ utteranceCount: 1, occurrenceCount: 1 })
        const otherText = await prisma.utterance.findFirst({ where: { speakerSegmentId: otherSeg.id } })
        expect(otherText?.text).toBe('foo foo foo in other meeting')
    })

    test('rejects an empty search term', async () => {
        await expect(replaceAllInUtterances(cityId, meetingId, '', 'x', true)).rejects.toThrow()
    })
})
