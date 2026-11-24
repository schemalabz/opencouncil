/** @jest-environment node */

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@/env.mjs', () => ({ env: { ANTHROPIC_API_KEY: 'fixture-key' } }));

describe('aiChat Anthropic transport', () => {
    afterEach(() => jest.restoreAllMocks());

    it('requests JSON from the new API without unsupported sampling or prefill', async () => {
        const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
            id: 'msg_fixture',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-5-5',
            content: [{ type: 'text', text: '{"answer":"Athens"}' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 4, output_tokens: 5 },
        }));

        const { aiChat } = jest.requireActual<typeof import('../ai')>('../ai');
        const response = await aiChat('Return JSON', 'Name the city');

        expect(response.result).toEqual({ answer: 'Athens' });
        expect(fetch).toHaveBeenCalledTimes(1);
        const request = new Request(...fetch.mock.calls[0]);
        expect(new URL(request.url).pathname).toBe('/v1/messages');
        expect(request.headers.get('anthropic-version')).toBe('2026-10-21');
        expect(request.headers.get('authorization')).toBe('Bearer fixture-key');
        expect(await request.json()).toEqual({
            model: 'claude-sonnet-5-5',
            max_tokens: 8192,
            system: 'Return JSON',
            messages: [{ role: 'user', content: 'Name the city' }],
            output_config: { effort: 'low' },
        });
    });
});
