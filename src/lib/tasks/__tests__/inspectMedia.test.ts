import { ApiError, BadRequestError } from '@/lib/api/errors';
import { inspectMedia } from '../inspectMedia';
import fixture from '../../../../tests/fixtures/media-contract.json';
jest.mock('@/env.mjs', () => ({ env: { TASK_API_URL: 'https://tasks.test', TASK_API_KEY: 'secret' } }));

beforeEach(() => { global.fetch = jest.fn(); });
it('uses a bounded 150-second authenticated lookup and strips unknown fields', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: true, source: { ...fixture.source, private: 'hidden' } }) });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual({ supported: true, source: fixture.source });
    expect(timeout).toHaveBeenCalledWith(150_000);
    expect(fetch).toHaveBeenCalledWith('https://tasks.test/inspectMedia', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' }, body: JSON.stringify({ url: 'https://video.test/watch' }) }));
    timeout.mockRestore();
});
it('returns a typed unsupported response unchanged', async () => {
    const body = { supported: false, ...fixture.permanentUpdate.mediaFailure, message: fixture.permanentUpdate.error };
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => body });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual(body);
});
it('does not mislabel transport failures or HTTP failures as unsupported', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(inspectMedia({ url: 'https://video.test/watch' })).rejects.toThrow(ApiError);
    await expect(inspectMedia({ url: 'https://video.test/watch' })).rejects.toThrow('503');
});
it('rejects invalid URLs before fetching and malformed backend responses', async () => {
    await expect(inspectMedia({ url: 'file:///secret' })).rejects.toThrow(BadRequestError);
    expect(fetch).not.toHaveBeenCalled();
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: false, reason: 'other' }) });
    await expect(inspectMedia({ url: 'https://video.test/watch' })).rejects.toThrow();
});

it('reports a timeout as a useful MCP tool error', async () => {
    const { run } = jest.requireActual<typeof import('@/lib/mcp/toolSupport')>('@/lib/mcp/toolSupport');
    (fetch as jest.Mock).mockRejectedValue(new DOMException('elapsed', 'TimeoutError'));
    const result = await run(() => inspectMedia({ url: 'https://video.test/watch' }));
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/timed out.*later/i);
});

it('sanitizes legacy backend source URLs before returning an inspection result', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: true, source: { kind: 'file', webpageUrl: 'https://u:p@video.test/watch?v=public&token=secret#fragment', thumbnailUrl: 'https://video.test/thumb?X-Goog-Signature=secret' } }) });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual({ supported: true, source: { kind: 'file', webpageUrl: 'https://video.test/watch?v=public', thumbnailUrl: 'https://video.test/thumb' } });
});

it('redacts legacy backend failure message and hint URLs', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: false, reason: 'error', retryable: true, message: 'Download failed https://u:p@video.test/private?token=secret', hint: 'Try https://video.test/private?sig=secret' }) });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual({ supported: false, reason: 'error', retryable: true, message: 'Download failed https://video.test', hint: 'Try https://video.test' });
});


it('preserves the inspection verdict when optional metadata is oversized or malformed', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: true,
        source: { kind: 'file', title: 'x'.repeat(4097), durationSeconds: -1,
            webpageUrl: 'not a URL', chapters: [{ title: 'Broken', startSeconds: 3, endSeconds: 1 }] } }) });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual({
        supported: true, source: { kind: 'file', title: 'x'.repeat(4096) },
    });
});

it('keeps a permanent refusal permanent when its explanation is oversized', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ supported: false,
        reason: 'not_found', retryable: false, message: 'x'.repeat(4097) }) });
    expect(await inspectMedia({ url: 'https://video.test/watch' })).toEqual({
        supported: false, reason: 'not_found', retryable: false, message: 'x'.repeat(4096),
    });
});
