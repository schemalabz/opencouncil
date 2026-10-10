/** @jest-environment node */

/**
 * The meeting writes start the transcription of a recording for a body
 * whose pipeline runs unattended (#829), and for no other.
 */
const mockAfter = jest.fn((fn: () => unknown) => { void fn(); });
const mockRequestTranscribeInternal = jest.fn();
const mockCreateMeetingRecord = jest.fn();
const mockUpdateMeetingRecord = jest.fn();
const mockGetCouncilMeetingDirect = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('next/server', () => ({ after: (fn: () => unknown) => mockAfter(fn) }));
jest.mock('@/lib/db/citiesAdmin', () => ({ getCityNameEnAndTimezone: jest.fn().mockResolvedValue({ name_en: 'Chania', timezone: 'Europe/Athens' }) }));
jest.mock('@/lib/db/meetings', () => ({
    generateUniqueMeetingId: jest.fn().mockResolvedValue('oct9_2026'),
    getCouncilMeetingDirect: (...args: unknown[]) => mockGetCouncilMeetingDirect(...args),
    upcomingMeetingsTag: (realm: string) => `realm:${realm}:upcoming-meetings`,
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('@/lib/db/meetingLifecycle', () => ({
    createMeetingRecord: (...args: unknown[]) => mockCreateMeetingRecord(...args),
    updateMeetingRecord: (...args: unknown[]) => mockUpdateMeetingRecord(...args),
}));
jest.mock('@/lib/discord', () => ({ sendMeetingCreatedAdminAlert: jest.fn() }));
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/tasks/processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
jest.mock('@/lib/cache/afterResponse', () => ({ revalidateAfterResponse: jest.fn() }));
const mockProcessAgendaText = jest.fn().mockResolvedValue({ saved: 0 });
jest.mock('@/lib/agendaText', () => ({ processAgendaText: (...args: unknown[]) => mockProcessAgendaText(...args) }));
jest.mock('@/lib/db/administrativeBodies', () => ({ isBodyOfCity: jest.fn().mockResolvedValue(true) }));
jest.mock('@/lib/tasks/transcribeInternal', () => ({ requestTranscribeInternal: (...args: unknown[]) => mockRequestTranscribeInternal(...args) }));

import { createMeetingWithEffects, updateMeetingWithEffects } from '../meetingWrites';

const PAST = new Date('2026-10-01T16:00:00Z');
const FUTURE = new Date('2099-10-01T16:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 'oct9_2026', cityId: 'chania', name: null, name_en: null, kind: 'regular', sessionNumber: null,
        dateTime: PAST, youtubeUrl: 'https://youtu.be/x', agendaUrl: null, released: false,
        scheduleStatus: 'scheduled', scheduleStatusReason: null, format: 'inPerson', closedToPublic: false, noRecording: false,
        place: null, postponedFromId: null, continuationOfId: null, administrativeBodyId: 'youth',
        administrativeBody: { id: 'youth', type: 'youthCouncil', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', place: null },
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRequestTranscribeInternal.mockResolvedValue(undefined);
});

describe('createMeetingWithEffects', () => {
    it('starts the transcription of a held meeting of a secondary body that has a recording', async () => {
        mockCreateMeetingRecord.mockResolvedValue(row());

        await createMeetingWithEffects('chania', { date: PAST, youtubeUrl: 'https://youtu.be/x', administrativeBodyId: 'youth' });

        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/x', 'oct9_2026', 'chania');
    });

    it.each([
        ['a meeting that has not started', row({ dateTime: FUTURE })],
        ['a meeting with no recording link', row({ youtubeUrl: null })],
        ['a meeting of a primary body', row({ administrativeBody: { id: 'c', type: 'council', name: 'ΔΣ', name_en: 'Council', place: null } })],
        ['a meeting that the body marked as not recorded', row({ noRecording: true })],
        ['a postponed meeting', row({ scheduleStatus: 'postponed' })],
    ])('starts nothing for %s', async (_name, meeting) => {
        mockCreateMeetingRecord.mockResolvedValue(meeting);

        await createMeetingWithEffects('chania', { date: meeting.dateTime, youtubeUrl: meeting.youtubeUrl, administrativeBodyId: 'youth' });

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
    });

    it('leaves a YouTube link saved while the stream may still run to the cron, and starts an uploaded file now', async () => {
        const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        mockCreateMeetingRecord.mockResolvedValue(row({ dateTime: anHourAgo, youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }));
        await createMeetingWithEffects('chania', { date: anHourAgo, youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', administrativeBodyId: 'youth' });
        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();

        mockCreateMeetingRecord.mockResolvedValue(row({ dateTime: anHourAgo, youtubeUrl: 'https://cdn.example.org/chania/oct9_2026_recording.mp4' }));
        await createMeetingWithEffects('chania', { date: anHourAgo, youtubeUrl: 'https://cdn.example.org/chania/oct9_2026_recording.mp4', administrativeBodyId: 'youth' });
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://cdn.example.org/chania/oct9_2026_recording.mp4', 'oct9_2026', 'chania');
    });

    // The summary that follows the transcription writes the statements of the
    // subjects; an agenda saved after it would replace them.
    it('extracts a pasted agenda before it starts the transcription', async () => {
        mockCreateMeetingRecord.mockResolvedValue(row());
        let extracted = false;
        mockProcessAgendaText.mockImplementation(async () => { await Promise.resolve(); extracted = true; return { saved: 1 }; });
        mockRequestTranscribeInternal.mockImplementation(async () => { expect(extracted).toBe(true); });

        const result = await createMeetingWithEffects('chania', { date: PAST, youtubeUrl: 'https://youtu.be/x', administrativeBodyId: 'youth', agendaText: '1. Θέμα' });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(result.processAgendaStatus).toBe('from_text');
        expect(mockProcessAgendaText).toHaveBeenCalledWith('chania', 'oct9_2026', '1. Θέμα');
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/x', 'oct9_2026', 'chania');
        expect(mockAfter).toHaveBeenCalledTimes(1);
    });

    it('logs a refusal instead of failing the write', async () => {
        mockCreateMeetingRecord.mockResolvedValue(row());
        mockRequestTranscribeInternal.mockRejectedValue(new Error('The meeting already has a transcript.'));

        await expect(createMeetingWithEffects('chania', { date: PAST, youtubeUrl: 'https://youtu.be/x', administrativeBodyId: 'youth' })).resolves.toBeDefined();
        await Promise.resolve();
        expect(console.error).toHaveBeenCalled();
    });
});

describe('updateMeetingWithEffects', () => {
    it('starts the transcription when the recording is new, and not on a repeated save', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row({ youtubeUrl: null }));
        mockUpdateMeetingRecord.mockResolvedValue(row());
        await updateMeetingWithEffects('chania', 'oct9_2026', { youtubeUrl: 'https://youtu.be/x' });
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/x', 'oct9_2026', 'chania');

        jest.clearAllMocks();
        mockGetCouncilMeetingDirect.mockResolvedValue(row());
        mockUpdateMeetingRecord.mockResolvedValue(row());
        await updateMeetingWithEffects('chania', 'oct9_2026', { place: 'Αίθουσα' });
        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
    });

    it('does not send the pasted agenda to the record write', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row());
        mockUpdateMeetingRecord.mockResolvedValue(row());

        await updateMeetingWithEffects('chania', 'oct9_2026', { place: 'Αίθουσα', agendaText: '1. Θέμα' });

        expect(mockUpdateMeetingRecord.mock.calls[0][2]).toEqual({ place: 'Αίθουσα' });
    });
});
