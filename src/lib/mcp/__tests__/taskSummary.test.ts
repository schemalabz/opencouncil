/** @jest-environment node */
import { mcpTaskSummary } from '../taskSummary';

const row = (overrides: object = {}) => ({
    id: 't1', type: 'transcribe', status: 'pending', stage: null, percentComplete: null, version: null,
    createdAt: new Date('2026-09-23T10:00:00Z'), updatedAt: new Date('2026-09-23T10:05:00Z'), error: null,
    ...overrides,
});

describe('mcpTaskSummary', () => {
    it('reports a running task with its progress and no end', () => {
        expect(mcpTaskSummary(row({ stage: 'diarization', percentComplete: 40 }))).toEqual({
            id: 't1', type: 'transcribe', status: 'pending', stage: 'diarization', percentComplete: 40,
            startedAt: '2026-09-23T10:00:00.000Z',
        });
    });

    it('reports a finished task with its end and without stale progress', () => {
        const done = mcpTaskSummary(row({ status: 'succeeded', percentComplete: 100 }));
        expect(done).toMatchObject({ status: 'succeeded', finishedAt: '2026-09-23T10:05:00.000Z' });
        expect(done).not.toHaveProperty('percentComplete');
        expect(done).not.toHaveProperty('error');
    });

    it('cuts the error of a failed task to a readable length', () => {
        const failed = mcpTaskSummary(row({ status: 'failed', error: 'x'.repeat(2000) }));
        expect(failed.error).toHaveLength(500);
        expect(mcpTaskSummary(row({ status: 'failed' })).error).toBe('unknown error');
    });
});
