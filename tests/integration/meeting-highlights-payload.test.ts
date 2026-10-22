/** @jest-environment node */

/**
 * The meeting's subject payload is public and shared through the cache, so a
 * subject carries only its showcased highlights. The highlights of the current
 * user reach the page through getHighlightsForMeeting.
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { GET as getMeeting } from '@/app/api/cities/[cityId]/meetings/[meetingId]/route'
import { getHighlightsForMeeting } from '@/lib/db/highlights'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSubject, createUser, signInAsSuperAdmin } from '../helpers/factories'
import { __setSessionEmail } from '../mocks/auth'

jest.mock('next/cache', () => ({
    unstable_cache: <T>(fn: T) => fn,
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
}))
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'greece' }))

const cityId = 'hl-city'
const meetingId = 'hl-meeting'
const AUTHOR_EMAIL = 'author@integration.test'
const DRAFT_NAME = 'draft-name-marker'
const VIDEO_NAME = 'unshowcased-video-marker'
const SHOWCASED_NAME = 'showcased-name-marker'

const ids = { authorId: '', adminEmail: '', showcasedId: '' }

async function anonymousMeetingPayload() {
    __setSessionEmail(null)
    const response = await getMeeting(
        new NextRequest(`http://localhost/api/cities/${cityId}/meetings/${meetingId}`),
        { params: Promise.resolve({ cityId, meetingId }) },
    )
    expect(response.status).toBe(200)
    return response.json() as Promise<{ subjects: { highlights: unknown[] }[] }>
}

describe('highlights in the meeting payload', () => {
    beforeAll(async () => {
        await resetDatabase(prisma)
        const admin = await signInAsSuperAdmin()
        const author = await createUser(AUTHOR_EMAIL)
        ids.authorId = author.id
        ids.adminEmail = admin.email

        await createCity({ id: cityId })
        await createMeeting(cityId, { id: meetingId, released: true, dateTime: new Date('2026-01-15T17:00:00Z') })
        const subject = await createSubject(meetingId, cityId, { agendaItemIndex: 1 })

        const base = { cityId, meetingId, subjectId: subject.id }
        await prisma.highlight.create({ data: { ...base, name: DRAFT_NAME, createdById: author.id } })
        await prisma.highlight.create({
            data: { ...base, name: VIDEO_NAME, createdById: author.id, videoUrl: 'https://cdn.example/unshowcased.mp4', muxPlaybackId: 'mux-unshowcased' },
        })
        const showcased = await prisma.highlight.create({
            data: {
                ...base, name: SHOWCASED_NAME, createdById: admin.id,
                videoUrl: 'https://cdn.example/showcased.mp4', muxPlaybackId: 'mux-showcased', isShowcased: true,
            },
        })
        ids.showcasedId = showcased.id
    })

    it('gives an anonymous reader only the showcased highlight, without its author', async () => {
        const body = await anonymousMeetingPayload()
        expect(body.subjects).toHaveLength(1)
        expect(body.subjects[0].highlights).toEqual([{
            id: ids.showcasedId,
            name: SHOWCASED_NAME,
            muxPlaybackId: 'mux-showcased',
            videoUrl: 'https://cdn.example/showcased.mp4',
        }])
        const text = JSON.stringify(body)
        expect(text).not.toContain(DRAFT_NAME)
        expect(text).not.toContain(VIDEO_NAME)
        expect(text).not.toContain(ids.authorId)
    })

    it('still gives the author their own highlights through the per-user read', async () => {
        __setSessionEmail(AUTHOR_EMAIL)
        const own = await getHighlightsForMeeting(cityId, meetingId)
        expect(own.map(h => h.name).sort()).toEqual([VIDEO_NAME, DRAFT_NAME].sort())
    })

    it('gives an editor every highlight through the per-user read', async () => {
        __setSessionEmail(ids.adminEmail)
        const all = await getHighlightsForMeeting(cityId, meetingId)
        expect(all.map(h => h.name).sort()).toEqual([DRAFT_NAME, SHOWCASED_NAME, VIDEO_NAME].sort())
    })
})
