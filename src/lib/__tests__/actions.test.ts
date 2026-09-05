import axios from 'axios';
import type { Result } from '@/lib/result';

const mockCacheHas = jest.fn();
const mockCacheSetJSON = jest.fn();

jest.mock('axios');
jest.mock('@/lib/discord', () => ({
    // Resolves to whether Discord accepted the message, like the real sender.
    sendErrorAdminAlert: jest.fn().mockResolvedValue(true),
}));
// Closures, not factory-local mocks: the outer consts survive isolateModules,
// so each freshly loaded copy of actions.ts talks to the same spies.
jest.mock('@/lib/cache/valkey', () => ({
    cacheHas: (...args: unknown[]) => mockCacheHas(...args),
    cacheSetJSON: (...args: unknown[]) => mockCacheSetJSON(...args),
    cacheGetJSON: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// actions.ts keeps module-level state (the per-status alert timestamps) and
// reads env at import time, so each case loads a fresh copy with the env it
// needs. The discord mock factory re-runs per isolated registry, giving a
// clean spy too. Mirrors src/lib/search/__tests__/hits.test.ts.
const load = (deploymentEnv: string) => {
    let actions!: typeof import('../actions');
    let discord!: { sendErrorAdminAlert: jest.Mock };
    jest.isolateModules(() => {
        jest.doMock('@/env.mjs', () => ({
            env: { GOOGLE_API_KEY: 'test-google-key', DEPLOYMENT_ENV: deploymentEnv },
        }));
        discord = require('@/lib/discord');
        actions = require('../actions');
    });
    return { ...actions, alert: discord.sendErrorAdminAlert };
};

const googleReplies = (data: unknown) => {
    mockedAxios.get.mockResolvedValue({ data });
};

describe('Google Places outage alerting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheHas.mockResolvedValue(false);
        mockCacheSetJSON.mockResolvedValue(true);
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('alerts the team when the API key is denied', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'REQUEST_DENIED', error_message: 'The provided API key is expired.' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(1);
        const [payload] = alert.mock.calls[0];
        expect(payload.source).toBe('Google Places');
        expect(payload.error).toContain('REQUEST_DENIED');
        expect(payload.error).toContain('The provided API key is expired.');
        expect(payload.context).toEqual({ operation: 'suggestions', status: 'REQUEST_DENIED' });
    });

    it('alerts when the quota is exhausted', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'OVER_QUERY_LIMIT' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].context).toMatchObject({ status: 'OVER_QUERY_LIMIT' });
    });

    it('alerts for a denied place details lookup', async () => {
        const { getPlaceDetails, alert } = load('production');
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceDetails({ placeId: 'abc' });

        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].context).toEqual({ operation: 'details', status: 'REQUEST_DENIED' });
    });

    it('alerts once per status while the outage lasts', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'REQUEST_DENIED' });

        // The autocomplete calls this on every debounced keystroke.
        await getPlaceSuggestions({ input: 'Πατ' });
        await getPlaceSuggestions({ input: 'Πατησ' });
        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(1);
    });

    it('alerts again for a different status', async () => {
        const { getPlaceSuggestions, alert } = load('production');

        googleReplies({ status: 'REQUEST_DENIED' });
        await getPlaceSuggestions({ input: 'Πατησίων 100' });
        googleReplies({ status: 'OVER_QUERY_LIMIT' });
        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(2);
    });

    it.each(['ZERO_RESULTS', 'NOT_FOUND', 'INVALID_REQUEST'])(
        'does not alert for %s',
        async (status) => {
            const { getPlaceSuggestions, alert } = load('production');
            googleReplies({ status, predictions: [] });

            await getPlaceSuggestions({ input: 'Πατησίων 100' });

            expect(alert).not.toHaveBeenCalled();
        }
    );

    it('does not alert on a successful lookup', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'OK', predictions: [{ place_id: 'abc', description: 'Πατησίων 100' }] });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).not.toHaveBeenCalled();
    });

    it('stays silent when another instance already alerted', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        mockCacheHas.mockResolvedValue(true);
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).not.toHaveBeenCalled();
    });

    it('writes a shared marker so other instances hold the same window', async () => {
        const { getPlaceSuggestions } = load('production');
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(mockCacheSetJSON).toHaveBeenCalledWith('oc:places:outage-alert:REQUEST_DENIED', 1, 3600);
    });

    it('still alerts when the cache is unavailable', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        // cacheHas returns false when Valkey is unset or down. A missed outage
        // is worse than a duplicate message, so the alert must go out.
        mockCacheHas.mockResolvedValue(false);
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(1);
    });

    it('does not touch the shared cache outside production', async () => {
        const { getPlaceSuggestions } = load('preview');
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(mockCacheHas).not.toHaveBeenCalled();
        expect(mockCacheSetJSON).not.toHaveBeenCalled();
    });

    it('does not suppress the window when Discord rejects the alert', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        alert.mockResolvedValue(false);
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        // Writing the marker here would silence every instance for an hour
        // over an alert nobody received.
        expect(mockCacheSetJSON).not.toHaveBeenCalled();
    });

    it('retries the alert after a failed delivery', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'REQUEST_DENIED' });

        alert.mockResolvedValue(false);
        await getPlaceSuggestions({ input: 'Πατησίων 100' });
        alert.mockResolvedValue(true);
        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(2);
        expect(mockCacheSetJSON).toHaveBeenCalledTimes(1);
    });

    it('logs instead of alerting outside production', async () => {
        const { getPlaceSuggestions, alert } = load('preview');
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('REQUEST_DENIED'));
    });
});

describe('Google Places status pass-through', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCacheHas.mockResolvedValue(false);
        mockCacheSetJSON.mockResolvedValue(true);
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns the Google status instead of collapsing it into an error', async () => {
        const { getPlaceSuggestions } = load('production');
        googleReplies({ status: 'REQUEST_DENIED', error_message: 'The provided API key is expired.' });

        // LocationSelector picks its message from this status, so the caller
        // must be able to read it. A failed Result would hide it in prose.
        const result = await getPlaceSuggestions({ input: 'Πατησίων 100' }) as Result<{ status: string }>;

        expect(result.success).toBe(true);
        expect(result.data?.status).toBe('REQUEST_DENIED');
    });

    it('still fails the Result when the request throws', async () => {
        const { getPlaceSuggestions } = load('production');
        mockedAxios.get.mockRejectedValue(new Error('Network Error'));

        const result = await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(result.success).toBe(false);
    });
});
