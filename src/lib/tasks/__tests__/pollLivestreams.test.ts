/** @jest-environment node */

const mockMeetingFindMany = jest.fn();
const mockTaskFindMany = jest.fn();
jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: { findMany: (...args: unknown[]) => mockMeetingFindMany(...args) },
        taskStatus: { findMany: (...args: unknown[]) => mockTaskFindMany(...args) },
    },
}));

const mockAiChat = jest.fn();
jest.mock('../../ai', () => ({ aiChat: (...args: unknown[]) => mockAiChat(...args) }));

const mockResolveChannelId = jest.fn();
const mockListRecentChannelVideos = jest.fn();
jest.mock('../../youtube', () => ({
    resolveChannelId: (...args: unknown[]) => mockResolveChannelId(...args),
    listRecentChannelVideos: (...args: unknown[]) => mockListRecentChannelVideos(...args),
    watchUrl: (id: string) => `https://www.youtube.com/watch?v=${id}`,
}));

const mockCacheHas = jest.fn();
const mockCacheSetJSON = jest.fn();
jest.mock('../../cache/valkey', () => ({
    cacheHas: (...args: unknown[]) => mockCacheHas(...args),
    cacheSetJSON: (...args: unknown[]) => mockCacheSetJSON(...args),
    cacheGetJSON: jest.fn(),
}));

const mockRequestTranscribeInternal = jest.fn();
jest.mock('../transcribeInternal', () => ({
    requestTranscribeInternal: (...args: unknown[]) => mockRequestTranscribeInternal(...args),
}));

const mockMatchedAlert = jest.fn().mockResolvedValue(undefined);
const mockMultiAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('../../discord', () => ({
    sendLivestreamMatchedAlert: (...args: unknown[]) => mockMatchedAlert(...args),
    sendLivestreamMultipleMeetingsAlert: (...args: unknown[]) => mockMultiAlert(...args),
}));

// Mutable so individual tests can flip YOUTUBE_API_KEY off.
const mockEnv: { YOUTUBE_API_KEY?: string; NEXTAUTH_URL: string } = {
    YOUTUBE_API_KEY: 'test-key',
    NEXTAUTH_URL: 'http://test',
};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { pollLivestreamsForRecentMeetings, matchMeetingToVideo } from '../pollLivestreams';

const CHANNEL = 'https://www.youtube.com/@cityofathens.youtube';

function meeting(overrides: Record<string, unknown> = {}) {
    return {
        id: 'm1',
        cityId: 'athens',
        name: '21η Τακτική Συνεδρίαση 10/06/2026',
        name_en: '21st Regular Council Session',
        dateTime: new Date('2026-06-10T18:00:00Z'),
        administrativeBody: { name: 'Δημοτικό Συμβούλιο', youtubeChannelUrl: CHANNEL },
        city: { name: 'Athens' },
        subjects: [{ name: 'Subject A' }, { name: 'Subject B' }],
        ...overrides,
    };
}

// A finished livestream: 2h long, ended well in the past (clears the grace period).
const VIDEO = {
    videoId: 'v1',
    title: '21η Τακτική Συνεδρίαση 10/06/2026',
    publishedAt: '2026-06-10T20:00:00Z',
    actualStartTime: '2026-06-10T18:00:00Z',
    actualEndTime: '2026-06-10T20:00:00Z',
};

function aiDecision(decision: Record<string, unknown>) {
    mockAiChat.mockResolvedValue({ result: decision, usage: {} });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.YOUTUBE_API_KEY = 'test-key';
    mockResolveChannelId.mockResolvedValue('UCchannel');
    mockListRecentChannelVideos.mockResolvedValue([VIDEO]);
    mockCacheHas.mockResolvedValue(false);
    mockCacheSetJSON.mockResolvedValue(true);
    mockRequestTranscribeInternal.mockResolvedValue(undefined);
});

// processAgenda succeeded, no transcribe in flight.
function processAgendaDone(meetingId = 'm1', cityId = 'athens') {
    return [{ councilMeetingId: meetingId, cityId, type: 'processAgenda', status: 'succeeded' }];
}

describe('matchMeetingToVideo', () => {
    it('short-circuits to no_match without calling the LLM when there are no videos', async () => {
        const result = await matchMeetingToVideo(
            { name: 'x', name_en: 'x', dateTime: new Date(), administrativeBodyName: 'b', subjectNames: [] },
            [],
        );
        expect(result.decision).toBe('no_match');
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it('passes the LLM decision through', async () => {
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.9, reasoning: 'aligned' });
        const result = await matchMeetingToVideo(
            { name: 'x', name_en: 'x', dateTime: new Date(), administrativeBodyName: 'b', subjectNames: ['s'] },
            [VIDEO],
        );
        expect(result).toEqual({ decision: 'match', videoId: 'v1', confidence: 0.9, reasoning: 'aligned' });
        expect(mockAiChat).toHaveBeenCalledTimes(1);
    });
});

describe('pollLivestreamsForRecentMeetings', () => {
    it('no-ops when YOUTUBE_API_KEY is unset', async () => {
        mockEnv.YOUTUBE_API_KEY = undefined;
        const summary = await pollLivestreamsForRecentMeetings();
        expect(summary.candidates).toBe(0);
        expect(mockMeetingFindMany).not.toHaveBeenCalled();
    });

    it('triggers transcription and alerts on a confident match', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'title+date align' });

        const summary = await pollLivestreamsForRecentMeetings();

        // Expected duration = actualEndTime - actualStartTime = 2h = 7200s.
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith(
            'https://www.youtube.com/watch?v=v1', 'm1', 'athens', { expectedDurationSeconds: 7200 },
        );
        expect(mockMatchedAlert).toHaveBeenCalledTimes(1);
        expect(summary.matched).toBe(1);
        expect(summary.results[0].action).toBe('transcribe_triggered');
    });

    it('skips a match still within the grace period (VOD may still be processing)', async () => {
        const justEnded = {
            ...VIDEO,
            actualStartTime: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
            actualEndTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // ended 10 min ago
        };
        mockListRecentChannelVideos.mockResolvedValue([justEnded]);
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'title+date align' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(summary.matched).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(summary.results[0].action).toBe('skipped');
    });

    it('does not retry a failed transcribe while still within the backoff window', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([
            ...processAgendaDone(),
            { councilMeetingId: 'm1', cityId: 'athens', type: 'transcribe', status: 'failed', responseBody: 'INCOMPLETE_RECORDING: downloaded 600s but expected ~7200s', updatedAt: new Date(Date.now() - 5 * 60 * 1000) }, // failed 5 min ago
        ]);

        const summary = await pollLivestreamsForRecentMeetings();

        expect(summary.candidates).toBe(0);
        expect(mockAiChat).not.toHaveBeenCalled();
        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
    });

    it('does not back off a failure that is not an incomplete-recording (e.g. manual/transient)', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([
            ...processAgendaDone(),
            // A non-VOD failure (no INCOMPLETE_RECORDING marker) 5 min ago must not consume
            // the backoff/cap — the meeting stays eligible on the normal cadence.
            { councilMeetingId: 'm1', cityId: 'athens', type: 'transcribe', status: 'failed', responseBody: 'pyannote diarization failed', updatedAt: new Date(Date.now() - 5 * 60 * 1000) },
        ]);
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'title+date align' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockRequestTranscribeInternal).toHaveBeenCalledTimes(1);
        expect(summary.matched).toBe(1);
    });

    it('retries a failed transcribe once the backoff window has passed', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([
            ...processAgendaDone(),
            { councilMeetingId: 'm1', cityId: 'athens', type: 'transcribe', status: 'failed', responseBody: 'INCOMPLETE_RECORDING: downloaded 600s but expected ~7200s', updatedAt: new Date(Date.now() - 45 * 60 * 1000) }, // failed 45 min ago
        ]);
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'title+date align' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockRequestTranscribeInternal).toHaveBeenCalledTimes(1);
        expect(summary.matched).toBe(1);
    });

    it('gives up after the attempt cap of failed transcribes', async () => {
        const failedRows = Array.from({ length: 8 }, () => (
            { councilMeetingId: 'm1', cityId: 'athens', type: 'transcribe', status: 'failed', responseBody: 'INCOMPLETE_RECORDING: downloaded 600s but expected ~7200s', updatedAt: new Date(Date.now() - 60 * 60 * 1000) }
        ));
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([...processAgendaDone(), ...failedRows]);

        const summary = await pollLivestreamsForRecentMeetings();

        expect(summary.candidates).toBe(0);
        expect(mockAiChat).not.toHaveBeenCalled();
        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        // Not silently dropped — surfaced in the summary so a persistent failure is visible.
        expect(summary.skipped).toBe(1);
        expect(summary.results).toHaveLength(1);
        expect(summary.results[0].action).toBe('gave_up');
        expect(summary.results[0].meetingId).toBe('m1');
    });

    it('does not transcribe when confidence is below threshold', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.5, reasoning: 'unsure' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(summary.matched).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it('ignores a videoId the channel did not actually return', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'match', videoId: 'hallucinated', confidence: 0.99, reasoning: 'made up' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(summary.matched).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it('alerts once for a multi-meeting stream and dedups via cache', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'multiple_meetings', videoId: 'v1', confidence: 0.9, reasoning: 'λογοδοσία + τακτική' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockMultiAlert).toHaveBeenCalledTimes(1);
        expect(mockCacheSetJSON).toHaveBeenCalledWith(
            'oc:livestream:multi-alert:athens:m1', 1, expect.any(Number),
        );
        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(summary.multipleMeetings).toBe(1);
        expect(summary.results[0].action).toBe('alerted_multiple');
    });

    it('does not re-alert a multi-meeting stream already alerted', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        mockCacheHas.mockResolvedValue(true);
        aiDecision({ decision: 'multiple_meetings', videoId: 'v1', confidence: 0.9, reasoning: 'combined' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(mockMultiAlert).not.toHaveBeenCalled();
        expect(mockCacheSetJSON).not.toHaveBeenCalled();
        expect(summary.results[0].action).toBe('alerted_multiple_skipped');
    });

    it('skips meetings without a succeeded processAgenda', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([]); // no processAgenda
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'x' });

        const summary = await pollLivestreamsForRecentMeetings();

        expect(summary.candidates).toBe(0);
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it('skips meetings with a transcribe already in flight', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue([
            ...processAgendaDone(),
            { councilMeetingId: 'm1', cityId: 'athens', type: 'transcribe', status: 'pending' },
        ]);

        const summary = await pollLivestreamsForRecentMeetings();

        expect(summary.candidates).toBe(0);
        expect(mockAiChat).not.toHaveBeenCalled();
    });

    it('dry run records a match without triggering transcription or alerts', async () => {
        mockMeetingFindMany.mockResolvedValue([meeting()]);
        mockTaskFindMany.mockResolvedValue(processAgendaDone());
        aiDecision({ decision: 'match', videoId: 'v1', confidence: 0.95, reasoning: 'x' });

        const summary = await pollLivestreamsForRecentMeetings({ dryRun: true });

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(mockMatchedAlert).not.toHaveBeenCalled();
        expect(summary.matched).toBe(1);
        expect(summary.results[0].action).toBe('dry_run');
    });

    it('resolves + lists each channel only once across meetings sharing it', async () => {
        mockMeetingFindMany.mockResolvedValue([
            meeting({ id: 'm1' }),
            meeting({ id: 'm2', name: '22η Ειδική Συνεδρίαση 18/06/2026' }),
        ]);
        mockTaskFindMany.mockResolvedValue([
            { councilMeetingId: 'm1', cityId: 'athens', type: 'processAgenda', status: 'succeeded' },
            { councilMeetingId: 'm2', cityId: 'athens', type: 'processAgenda', status: 'succeeded' },
        ]);
        aiDecision({ decision: 'no_match', confidence: 0.9, reasoning: 'none' });

        await pollLivestreamsForRecentMeetings();

        expect(mockResolveChannelId).toHaveBeenCalledTimes(1);
        expect(mockListRecentChannelVideos).toHaveBeenCalledTimes(1);
    });
});
