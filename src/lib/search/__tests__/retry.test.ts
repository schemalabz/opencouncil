/** @jest-environment node */
import { inspect } from 'node:util';
import { errors } from '@elastic/elasticsearch';
import { executeElasticsearchWithRetry } from '../retry';

const CANARY_QUERY = 'καναρίνι στην πλατεία';

function failedQuery(): InstanceType<typeof errors.ResponseError> {
    const reason = `failed to create query: {"match":{"text":{"query":"${CANARY_QUERY}"}}}`;
    return new errors.ResponseError({
        body: {
            error: {
                type: 'search_phase_execution_exception',
                reason: 'all shards failed',
                caused_by: { type: 'query_shard_exception', reason },
                root_cause: [{ type: 'query_shard_exception', reason }],
            },
            status: 400,
        },
        statusCode: 400,
        headers: {},
        warnings: null,
        meta: {
            context: null,
            name: 'elasticsearch-js',
            request: { params: { method: 'POST', path: '/subjects/_search', body: JSON.stringify({ query: { match: { text: CANARY_QUERY } } }) }, options: {}, id: 1 },
            connection: null,
            attempts: 0,
            aborted: false,
        },
    });
}

describe('executeElasticsearchWithRetry', () => {
    it('throws a failed query without the query: the message names the types, and the request body is gone', async () => {
        const error = failedQuery();
        expect(inspect(error, { depth: 10 })).toContain(CANARY_QUERY);

        const thrown = await executeElasticsearchWithRetry(() => Promise.reject(error), 'Search').catch((caught: unknown) => caught);

        expect(thrown).toBe(error);
        expect(error).toBeInstanceOf(errors.ResponseError);
        expect(error.message).toBe('Status 400: search_phase_execution_exception; caused by: query_shard_exception; root causes: query_shard_exception');
        expect(inspect(error, { depth: 10 })).not.toContain(CANARY_QUERY);
        expect(String(error)).not.toContain(CANARY_QUERY);
    });
});
