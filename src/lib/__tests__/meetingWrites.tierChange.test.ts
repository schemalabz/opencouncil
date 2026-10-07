/** @jest-environment node */

/**
 * A public meeting that moves between the two tiers (#829) can give its city
 * the only public route it has, or take it away: the update busts the city
 * lists, and the calendar event follows the tier.
 */
const mockRevalidateAfterResponse = jest.fn();
const mockSyncMeetingToCalendar = jest.fn();
const mockUpdateMeetingRecord = jest.fn();
const mockGetCouncilMeetingDirect = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('next/server', () => ({ after: jest.fn() }));
jest.mock('@/lib/db/citiesAdmin', () => ({ getCityNameEnAndTimezone: jest.fn().mockResolvedValue({ name_en: 'Chania', timezone: 'Europe/Athens' }) }));
jest.mock('@/lib/db/meetings', () => ({
    cityListTags: (realm: string) => ['cities:all', `realm:${realm}:cities:all`],
    generateUniqueMeetingId: jest.fn(),
    getCouncilMeetingDirect: (...args: unknown[]) => mockGetCouncilMeetingDirect(...args),
    upcomingMeetingsTag: (realm: string) => `realm:${realm}:upcoming-meetings`,
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('@/lib/db/meetingLifecycle', () => ({
    createMeetingRecord: jest.fn(),
    updateMeetingRecord: (...args: unknown[]) => mockUpdateMeetingRecord(...args),
}));
jest.mock('@/lib/discord', () => ({ sendMeetingCreatedAdminAlert: jest.fn() }));
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: (...args: unknown[]) => mockSyncMeetingToCalendar(...args) }));
jest.mock('@/lib/tasks/processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
jest.mock('@/lib/cache/afterResponse', () => ({ revalidateAfterResponse: (...args: unknown[]) => mockRevalidateAfterResponse(...args) }));
jest.mock('@/lib/agendaText', () => ({ processAgendaText: jest.fn() }));
jest.mock('@/lib/db/administrativeBodies', () => ({ isBodyOfCity: jest.fn().mockResolvedValue(true) }));
jest.mock('@/lib/tasks/transcribeInternal', () => ({ requestTranscribeInternal: jest.fn() }));

import { updateMeetingWithEffects } from '../meetingWrites';

const council = { id: 'council', type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: null };
const youth = { id: 'youth', type: 'youthCouncil', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', place: null };

function row(body: typeof council, released: boolean, overrides: Record<string, unknown> = {}) {
    return {
        id: 'oct9_2026', cityId: 'chania', name: null, name_en: null, kind: 'regular', sessionNumber: null,
        dateTime: new Date('2026-10-01T16:00:00Z'), youtubeUrl: null, agendaUrl: null, released,
        scheduleStatus: 'scheduled', scheduleStatusReason: null, format: 'inPerson', closedToPublic: false, noRecording: false,
        place: null, postponedFromId: null, continuationOfId: null, administrativeBodyId: body.id, administrativeBody: body,
        ...overrides,
    };
}

function tags(): string[] {
    return mockRevalidateAfterResponse.mock.calls[0][0].tags;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSyncMeetingToCalendar.mockResolvedValue(undefined);
});

describe('updateMeetingWithEffects on a change of tier', () => {
    it('busts the city lists when a public meeting leaves the secondary tier, and gives it a calendar event', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(youth, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, true));

        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'council' });

        expect(tags()).toEqual(expect.arrayContaining(['cities:all', 'realm:greece:cities:all']));
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: true });
    });

    it('busts the city lists when a public meeting joins the secondary tier, and creates no event', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(council, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(youth, true));

        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'youth' });

        expect(tags()).toEqual(expect.arrayContaining(['cities:all']));
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: false });
    });

    it('leaves the city lists alone for a draft that changes tier, and for an edit that keeps the tier', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(youth, false));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, false));
        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'council' });
        expect(tags()).not.toContain('cities:all');

        jest.clearAllMocks();
        mockGetCouncilMeetingDirect.mockResolvedValue(row(council, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, true, { place: 'Αίθουσα' }));
        await updateMeetingWithEffects('chania', 'oct9_2026', { place: 'Αίθουσα' });
        expect(tags()).not.toContain('cities:all');
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: false });
    });
});
