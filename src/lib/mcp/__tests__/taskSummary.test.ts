/** @jest-environment node */
import { mcpTaskSummary } from '../taskSummary';

const row = (overrides: object = {}) => ({
    mediaFailure: undefined, mediaSource: null, id: 't1', type: 'transcribe', status: 'pending', stage: null, percentComplete: null, version: null,
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


it('omits success source and exposes mediaFailure only for failed transcribes', () => {
    const source = { kind: 'yt-dlp', title: 'Council', ignored: 'secret' };
    const mediaFailure = { reason: 'playlist', retryable: false, hint: 'Select one video' };
    expect(mcpTaskSummary(row({ status: 'succeeded', mediaSource: source }))).not.toHaveProperty('source');
    expect(mcpTaskSummary(row({ status: 'failed', mediaFailure })).mediaFailure).toEqual(mediaFailure);
    expect(mcpTaskSummary(row({ status: 'pending', mediaSource: source, mediaFailure }))).not.toHaveProperty('source');
    expect(mcpTaskSummary(row({ status: 'failed', mediaFailure: { reason: 'made_up', retryable: true } }))).not.toHaveProperty('mediaFailure');
    expect(mcpTaskSummary(row({ type: 'summarize', status: 'succeeded', mediaSource: source }))).not.toHaveProperty('source');
});

it('does not expose legacy source metadata in status polls', () => {
    const task = row({ status: 'succeeded', mediaSource: { kind: 'yt-dlp', webpageUrl: 'https://u:p@video.test/watch?v=public&token=secret#fragment' } });
    expect(mcpTaskSummary(task)).not.toHaveProperty('source');
});

it('redacts URL paths and credentials from legacy transcribe errors while preserving actionable prose', () => {
    const error = 'Unable to download https://u:p@video.test/private/object?token=secret#frag: HTTP Error 503';
    const result = mcpTaskSummary(row({ status: 'failed', error, mediaFailure: { reason: 'error', retryable: true, hint: 'Try https://u:p@video.test/private?token=secret' } }));
    expect(result.error).toBe('Unable to download https://video.test HTTP Error 503');
    expect(result.mediaFailure?.hint).toBe('Try https://video.test');
});
