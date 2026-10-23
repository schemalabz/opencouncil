/** @jest-environment node */
/**
 * The search index holds subject summaries, not the transcript, so "was X
 * mentioned" has one route: the word filter of get_transcript. These tests
 * pin what the filter matches and what a matched segment carries.
 */
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpGetTranscript } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createPerson,
    createSpeakerSegment,
    createSpeakerTag,
    createUser,
    createUtterance,
} from '../helpers/factories'

// The token of a superadmin account, which sees every draft.
let SUPERADMIN: { userId: string }

const asRequest = <T>(fn: () => Promise<T>) =>
    mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', SUPERADMIN), fn)

const page = { page: 1, pageSize: 40, includeUtteranceIds: false }

describe('get_transcript word filter - integration', () => {
    let personId: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        SUPERADMIN = { userId: (await createUser('bot@example.com', { isSuperAdmin: true })).id }
        await createCity({ id: 'athens', realm: Realm.greece })
        await createMeeting('athens', { id: 'm1', dateTime: new Date('2026-05-05T15:00:00Z'), released: true })

        personId = (await createPerson('athens', { name: 'Μαρία Παππά' })).id
        const chair = await createSpeakerTag({ label: 'Πρόεδρος' })
        const councillor = await createSpeakerTag({ label: 'Σύμβουλος', personId })

        const lines: Array<[string, string]> = [
            [chair.id, 'Ξεκινάμε με το πρώτο θέμα της ημερήσιας διάταξης.'],
            [councillor.id, 'Η σύμβαση με το Λιμενικό Ταμείο για τον πεζόδρομο υπογράφηκε χθες.'],
            [chair.id, 'Το Λιμενικό δεν απάντησε ακόμα για τον δρόμο.'],
            [councillor.id, 'Για το πάρκο θα μιλήσουμε την επόμενη φορά.'],
            // A decomposed accent (iota + U+0301), as some sources store it.
            [chair.id, 'Η δημοτικη\u0301 αρχή ζήτησε μελέτη για τον πεζόδρομο.'],
        ]
        for (const [index, [speakerTagId, text]] of lines.entries()) {
            const segment = await createSpeakerSegment('m1', 'athens', {
                speakerTagId, startTimestamp: index * 60, endTimestamp: index * 60 + 50,
            })
            await createUtterance(segment.id, { text, startTimestamp: index * 60, endTimestamp: index * 60 + 10 })
        }
    })

    test('matches without accents and in any case, and requires every term', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'ΛΙΜΕΝΙΚΟ ταμειο' }, SUPERADMIN))

        expect(result.query).toBe('ΛΙΜΕΝΙΚΟ ταμειο')
        expect(result.segments.map(s => s.text)).toEqual([
            'Η σύμβαση με το Λιμενικό Ταμείο για τον πεζόδρομο υπογράφηκε χθες.',
        ])
        expect(result.pagination).toEqual({ total: 1, page: 1, pageSize: 40, totalPages: 1 })
    })

    test('a single term finds every segment that says it', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'λιμενικο' }, SUPERADMIN))

        expect(result.pagination.total).toBe(2)
        expect(result.segments.map(s => s.startSec)).toEqual([60, 120])
    })

    test('combines with the speaker filter', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'λιμενικό', personId }, SUPERADMIN))

        expect(result.speaker).toBe('Μαρία Παππά')
        expect(result.pagination.total).toBe(1)
        expect(result.segments.map(s => s.startSec)).toEqual([60])
    })

    test('a matched segment carries a snippet around the hit', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'υπογράφηκε' }, SUPERADMIN))

        expect(result.segments).toHaveLength(1)
        expect(result.segments[0].snippets).toEqual([
            'Η σύμβαση με το Λιμενικό Ταμείο για τον πεζόδρομο υπογράφηκε χθες.',
        ])
    })

    test('a decomposed accent before the hit does not lose the snippet', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'μελετη' }, SUPERADMIN))

        expect(result.segments).toHaveLength(1)
        expect(result.segments[0].snippets).toHaveLength(1)
        expect(result.segments[0].snippets?.[0]).toContain('μελέτη για τον πεζόδρομο')
    })

    test('reports no match without inventing a page', async () => {
        const result = await asRequest(() =>
            mcpGetTranscript('athens', 'm1', { ...page, query: 'λιμάνι' }, SUPERADMIN))

        expect(result.segments).toEqual([])
        expect(result.pagination.total).toBe(0)
    })

    test('an unfiltered call carries neither query nor snippets', async () => {
        const result = await asRequest(() => mcpGetTranscript('athens', 'm1', page, SUPERADMIN))

        expect(result).not.toHaveProperty('query')
        expect(result.segments[0]).not.toHaveProperty('snippets')
    })
})
