import { realAnthropic } from '../anthropic';

jest.mock('@/env.mjs', () => ({ env: { ANTHROPIC_API_KEY: 'fixture-key' } }));

afterEach(() => jest.restoreAllMocks());

it('decodes large tool input across stream chunks and retains cache usage', async () => {
  const input = { query: 'δημοτικό συμβούλιο '.repeat(1500) };
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_fixture',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 20, output_tokens: 0, cache_creation_input_tokens: 6, cache_read_input_tokens: 2 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool_fixture', name: 'lookup', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 30 },
    },
    { type: 'message_stop' },
  ];
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 1024) {
        controller.enqueue(bytes.slice(offset, offset + 1024));
      }
      controller.close();
    },
  });
  const transport = jest.spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));

  const reply = await realAnthropic.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 2048,
    system: [{ type: 'text', text: 'Use the lookup tool', cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: 'Find a council meeting' }],
  });

  expect(reply.content).toEqual([{ type: 'tool_use', id: 'tool_fixture', name: 'lookup', input }]);
  expect(reply.stop_reason).toBe('tool_use');
  expect(reply.usage).toMatchObject({ input_tokens: 20, output_tokens: 30, cache_creation_input_tokens: 6, cache_read_input_tokens: 2 });
  expect(transport).toHaveBeenCalledTimes(1);
  const request = new Request(...transport.mock.calls[0]);
  expect(new URL(request.url).pathname).toBe('/v1/messages');
  expect(request.headers.get('anthropic-beta')).toContain('extended-cache-ttl-2025-04-11');
  expect(await request.json()).toMatchObject({
    stream: true,
    thinking: { type: 'adaptive' },
    system: [{ cache_control: { ttl: '1h' } }],
  });
});
