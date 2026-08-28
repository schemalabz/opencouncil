/** @jest-environment node */
/**
 * Creating a highlight and rendering it used to be two tool calls, so an agent
 * asked the user to approve the same clip twice. create_highlight now takes the
 * render options itself. These tests pin the one-call path against a real
 * database — including the case where the meeting has no video, where the
 * selection the user already approved must survive.
 */
import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { mcpCreateHighlight } from '@/lib/mcp/data'
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context'
import { requestGenerateHighlightCore } from '@/lib/tasks/generateHighlight-core'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createCity,
    createMeeting,
    createSpeakerSegment,
    createSpeakerTag,
    createUtterance,
} from '../helpers/factories'

// The render itself is queued with the task API, which no test should reach.
jest.mock('@/lib/tasks/generateHighlight-core', () => ({
    requestGenerateHighlightCore: jest.fn().mockResolvedValue(undefined),
}))
const mockRequestRender = requestGenerateHighlightCore as jest.MockedFunction<typeof requestGenerateHighlightCore>

// A service key bypasses the per-city highlight permission, like the admin panel's.
const SERVICE = { type: 'service', keyName: 'test' } as const

const asRequest = <T>(fn: () => Promise<T>) =>
    mcpRealmStore.run(requestContext(Realm.greece, 'opencouncil.gr', SERVICE), fn)

describe('MCP highlight creation with a video in one call - integration', () => {
    let utteranceIds: string[]

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        mockRequestRender.mockClear()
        await createCity({ id: 'athens', realm: Realm.greece })

        await createMeeting('athens', {
            id: 'recorded', dateTime: new Date('2026-08-18T07:30:00Z'), released: true,
            videoUrl: 'https://example.com/meeting.mp4',
        })
        // Same meeting, minus the recording there is nothing to cut from.
        await createMeeting('athens', {
            id: 'silent', dateTime: new Date('2026-08-11T07:30:00Z'), released: true,
        })

        const tag = await createSpeakerTag({ label: 'Δήμαρχος' })
        for (const meetingId of ['recorded', 'silent']) {
            const segment = await createSpeakerSegment(meetingId, 'athens', { speakerTagId: tag.id })
            await createUtterance(segment.id, { text: 'Ξεκινάμε τη συνεδρίαση.' })
        }
        const utterances = await prisma.utterance.findMany({
            where: { speakerSegment: { meetingId: 'recorded' } },
            select: { id: true },
        })
        utteranceIds = utterances.map(u => u.id)
    })

    test('queues the render in the same call as the highlight', async () => {
        const result = await asRequest(() => mcpCreateHighlight(SERVICE, {
            cityId: 'athens', meetingId: 'recorded', name: 'Κλιπ', utteranceIds,
            video: { aspectRatio: 'social-9x16', includeCaptions: false },
        }))

        expect(result.video).toEqual({
            status: 'generating',
            format: { aspectRatio: 'social-9x16', includeCaptions: false, includeSpeakerOverlay: true },
        })
        expect(mockRequestRender).toHaveBeenCalledWith(result.id, expect.objectContaining({
            aspectRatio: 'social-9x16',
            includeCaptions: false,
            includeSpeakerOverlay: true,
            // Vertical clips carry the same social framing the website applies.
            socialOptions: { marginType: 'blur', zoomFactor: 1.0 },
        }))
    })

    test('an empty video object renders the website\'s default landscape clip', async () => {
        const result = await asRequest(() => mcpCreateHighlight(SERVICE, {
            cityId: 'athens', meetingId: 'recorded', name: 'Κλιπ', utteranceIds, video: {},
        }))

        expect(result.video).toEqual({
            status: 'generating',
            format: { aspectRatio: 'default', includeCaptions: true, includeSpeakerOverlay: true },
        })
    })

    test('saves the highlight without a render when video is omitted', async () => {
        const result = await asRequest(() => mcpCreateHighlight(SERVICE, {
            cityId: 'athens', meetingId: 'recorded', name: 'Κλιπ', utteranceIds,
        }))

        expect(result.video).toEqual({ status: 'not_generated' })
        expect(mockRequestRender).not.toHaveBeenCalled()
        expect(await prisma.highlight.findUnique({ where: { id: result.id } })).not.toBeNull()
    })

    test('keeps the highlight when the render cannot be queued', async () => {
        // The render runs on a separate service. A failure there must not read
        // as "nothing was saved": the agent would create the highlight again.
        mockRequestRender.mockRejectedValueOnce(new Error('task API unreachable'))

        const result = await asRequest(() => mcpCreateHighlight(SERVICE, {
            cityId: 'athens', meetingId: 'recorded', name: 'Κλιπ', utteranceIds, video: {},
        }))

        expect(await prisma.highlight.findUnique({ where: { id: result.id } })).not.toBeNull()
        expect(result.video).toEqual({ status: 'not_generated' })
        expect(result.next).toMatch(/generate_highlight_video/)
    })

    test('keeps the highlight when the meeting has no video to render from', async () => {
        const silent = await prisma.utterance.findMany({
            where: { speakerSegment: { meetingId: 'silent' } },
            select: { id: true },
        })

        const result = await asRequest(() => mcpCreateHighlight(SERVICE, {
            cityId: 'athens', meetingId: 'silent', name: 'Κλιπ', utteranceIds: silent.map(u => u.id),
            video: {},
        }))

        // Throwing here would discard a selection the user has already
        // approved, over a video they can do without.
        expect(await prisma.highlight.findUnique({ where: { id: result.id } })).not.toBeNull()
        expect(result.video).toEqual({ status: 'not_generated' })
        expect(result.next).toMatch(/no video/)
        expect(mockRequestRender).not.toHaveBeenCalled()
    })
})
