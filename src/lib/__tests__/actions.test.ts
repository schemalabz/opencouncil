import axios from 'axios';
import type { Result } from '@/lib/result';

jest.mock('axios');
jest.mock('@/lib/discord', () => ({
    sendErrorAdminAlert: jest.fn().mockResolvedValue(undefined),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// actions.ts reads env at import time, so each case loads a fresh copy with the
// env it needs. The discord mock factory re-runs per isolated registry, which
// gives a clean spy too. Mirrors src/lib/search/__tests__/hits.test.ts.
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

    it('alerts on every failed lookup, with no throttle', async () => {
        const { getPlaceSuggestions, alert } = load('production');
        googleReplies({ status: 'REQUEST_DENIED' });

        await getPlaceSuggestions({ input: 'Πατ' });
        await getPlaceSuggestions({ input: 'Πατησ' });
        await getPlaceSuggestions({ input: 'Πατησίων 100' });

        expect(alert).toHaveBeenCalledTimes(3);
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
