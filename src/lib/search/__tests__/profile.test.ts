jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'subjects' } }));

import type { Client } from '@elastic/elasticsearch';
import { DEFAULT_SCORE_PROFILE, resetIndexProfileCache, resolveIndexProfile } from '../profile';

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
        const profile = await resolveIndexProfile(clientWith(jest.fn().mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v3'))));

        expect(profile).toEqual({ index: 'subjects-2026-10', inferenceId: '.jina-embeddings-v3', ...DEFAULT_SCORE_PROFILE });
    });

    it('falls back to the schema profile under the alias when the mapping cannot be read, and retries next time', async () => {
        const getMapping = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v3'));
        const client = clientWith(getMapping);

        expect(await resolveIndexProfile(client)).toEqual({ index: 'subjects', inferenceId: null, ...DEFAULT_SCORE_PROFILE });
        expect((await resolveIndexProfile(client)).index).toBe('subjects-2026-10');
        expect(getMapping).toHaveBeenCalledTimes(2);
    });

    it('warns once and uses the schema profile for an endpoint it does not know', async () => {
        const profile = await resolveIndexProfile(clientWith(jest.fn().mockResolvedValue(mappingOf('subjects-2027-01', '.some-new-model'))));

        expect(profile).toEqual({ index: 'subjects-2027-01', inferenceId: '.some-new-model', ...DEFAULT_SCORE_PROFILE });
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('reads the alias once and reuses the answer', async () => {
        const getMapping = jest.fn().mockResolvedValue(mappingOf('subjects-2026-10', '.jina-embeddings-v3'));
        const client = clientWith(getMapping);

        await resolveIndexProfile(client);
        await resolveIndexProfile(client);

        expect(getMapping).toHaveBeenCalledTimes(1);
    });
});
