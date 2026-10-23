jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'subjects' } }));

import type { Client } from '@elastic/elasticsearch';
import { DEFAULT_SCORE_PROFILE, isIndexNotFound, resetIndexProfileCache, resolveIndexProfile, withIndexProfile } from '../profile';

const mappingOf = (index: string, inferenceId: string) => ({
    [index]: { mappings: { properties: { name: { type: 'text', fields: { semantic: { type: 'semantic_text', inference_id: inferenceId } } } } } },
});

const clientWith = (getMapping: jest.Mock) => ({ indices: { getMapping } }) as unknown as Client;

beforeEach(() => {
    resetIndexProfileCache();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('resolveIndexProfile', () => {
    it('names the concrete index behind the alias and the thresholds of its model', async () => {
        const getMapping = jest.fn().mockResolvedValue(mappingOf('subjects-2026-08', 'opencouncil-multilingual-e5-small-elasticsearch'));

        const profile = await resolveIndexProfile(clientWith(getMapping));

        expect(getMapping).toHaveBeenCalledWith({ index: 'subjects' });
        expect(profile).toEqual({
            index: 'subjects-2026-08',
            inferenceId: 'opencouncil-multilingual-e5-small-elasticsearch',
            semanticMinScore: 0.934,
            semanticMappedScale: 320,
            relatedMinSimilarity: 0.93,
        });
    });

    it('serves the schema profile for the schema endpoint', async () => {
        const profile = await resolveIndexProfile(clientWith(jest.fn().mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'))));

        expect(profile).toEqual({ index: 'subjects-2026-10', inferenceId: '.jina-embeddings-v5-text-small', ...DEFAULT_SCORE_PROFILE });
    });

    it('falls back to the schema profile under the alias when nothing was ever resolved, and retries next time', async () => {
        const getMapping = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'));
        const client = clientWith(getMapping);

        expect(await resolveIndexProfile(client)).toEqual({ index: 'subjects', inferenceId: null, ...DEFAULT_SCORE_PROFILE });
        expect((await resolveIndexProfile(client)).index).toBe('subjects-2026-10');
        expect(getMapping).toHaveBeenCalledTimes(2);
    });

    // The mapping of an index does not change, so a known answer beats the
    // build's guess: a refresh that fails must not move an e5 index onto the
    // jina thresholds.
    it('keeps the last known profile when a refresh fails, and waits before trying again', async () => {
        jest.useFakeTimers();
        try {
            const getMapping = jest.fn()
                .mockResolvedValueOnce(mappingOf('subjects-2026-08', 'opencouncil-multilingual-e5-small-elasticsearch'))
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'));
            const client = clientWith(getMapping);

            expect((await resolveIndexProfile(client)).index).toBe('subjects-2026-08');
            jest.advanceTimersByTime(5 * 60 * 1000 + 1);
            const kept = await resolveIndexProfile(client);
            expect(kept).toMatchObject({ index: 'subjects-2026-08', semanticMinScore: 0.934, relatedMinSimilarity: 0.93 });
            expect(getMapping).toHaveBeenCalledTimes(2);

            // Inside the retry delay the kept profile is served without a read.
            await resolveIndexProfile(client);
            expect(getMapping).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(30 * 1000 + 1);
            expect((await resolveIndexProfile(client)).index).toBe('subjects-2026-10');
            expect(getMapping).toHaveBeenCalledTimes(3);
        } finally {
            jest.useRealTimers();
        }
    });

    it('warns once and uses the schema profile for an endpoint it does not know', async () => {
        const profile = await resolveIndexProfile(clientWith(jest.fn().mockResolvedValue(mappingOf('subjects-2027-01', '.some-new-model'))));

        expect(profile).toEqual({ index: 'subjects-2027-01', inferenceId: '.some-new-model', ...DEFAULT_SCORE_PROFILE });
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('reads the alias once and reuses the answer', async () => {
        const getMapping = jest.fn().mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'));
        const client = clientWith(getMapping);

        await resolveIndexProfile(client);
        await resolveIndexProfile(client);

        expect(getMapping).toHaveBeenCalledTimes(1);
    });
});

describe('isIndexNotFound', () => {
    it('recognises the Elasticsearch answer for a missing index, and nothing else', () => {
        expect(isIndexNotFound({ meta: { body: { error: { type: 'index_not_found_exception' } } } })).toBe(true);
        expect(isIndexNotFound({ meta: { body: { error: { type: 'search_phase_execution_exception' } } } })).toBe(false);
        expect(isIndexNotFound(new Error('timeout'))).toBe(false);
        expect(isIndexNotFound(null)).toBe(false);
    });
});

describe('withIndexProfile', () => {
    it('drops the stale profile and runs once more when the index is gone', async () => {
        const getMapping = jest.fn()
            .mockResolvedValueOnce(mappingOf('subjects-2026-08', 'opencouncil-multilingual-e5-small-elasticsearch'))
            .mockResolvedValueOnce(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'));
        const run = jest.fn()
            .mockRejectedValueOnce({ meta: { body: { error: { type: 'index_not_found_exception' } } } })
            .mockResolvedValueOnce('hits');

        expect(await withIndexProfile(clientWith(getMapping), run)).toBe('hits');
        expect(run.mock.calls.map(([profile]) => profile.index)).toEqual(['subjects-2026-08', 'subjects-2026-10']);
    });

    it('rethrows every other failure without touching the profile', async () => {
        const getMapping = jest.fn().mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v5-text-small'));
        const failure = new Error('timeout');

        await expect(withIndexProfile(clientWith(getMapping), jest.fn().mockRejectedValue(failure))).rejects.toBe(failure);
        expect(getMapping).toHaveBeenCalledTimes(1);
    });
});
