/** @jest-environment node */
// The single-meeting GET has no auth. The new meeting of a postponement must
// not name the meeting that it replaced, which readers can no longer see.
jest.mock('@/lib/getMeetingData', () => ({ getMeetingDataCore: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ updateMeetingRecord: jest.fn() }));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeetingDirect: jest.fn() }));
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn(), revalidatePath: jest.fn() }));

import { GET } from '../route';
import { getMeetingDataCore } from '@/lib/getMeetingData';

const mockCore = getMeetingDataCore as jest.MockedFunction<typeof getMeetingDataCore>;

function meetingData(postponedFromId: string | null) {
    return {
        meeting: {
            id: 'mar19_2026',
            cityId: 'chania',
            name: null,
            name_en: null,
            kind: 'regular',
            dateTime: new Date('2026-03-19T16:00:00Z'),
            place: null,
            postponedFromId,
            postponedFromDate: new Date('2026-03-12T16:00:00Z'),
            administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: null },
        },
        city: { timezone: 'Europe/Athens' },
        transcript: [],
        speakerTags: [],
        transcriptHiddenForReview: false,
    } as unknown as Awaited<ReturnType<typeof getMeetingDataCore>>;
}

describe('GET /api/cities/[cityId]/meetings/[meetingId]', () => {
    it.each([null, 'mar12_2026'])('never returns the id of the postponed meeting (link in the row: %s)', async (postponedFromId) => {
        mockCore.mockResolvedValue(meetingData(postponedFromId));
        const response = await GET({} as Request, { params: Promise.resolve({ cityId: 'chania', meetingId: 'mar19_2026' }) });
        const text = await response.text();
        expect(text).not.toContain('postponedFromId');
        expect(text).not.toContain('mar12_2026');
        expect(JSON.parse(text).meeting).toMatchObject({
            name: 'Δημοτικό Συμβούλιο 19/03/2026',
            name_en: 'Municipal Council 19/03/2026',
            postponedFromDate: '2026-03-12T16:00:00.000Z',
        });
    });
});
