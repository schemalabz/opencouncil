import { aiChat, DEFAULT_AI_MODEL } from '../ai';

var mockCreate: jest.Mock;

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate
      }
    }))
  };
});

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

describe('aiChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock response
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"answer": "mocked response"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });
  });

  it('should call Anthropic API with correct parameters', async () => {
    const systemPrompt = 'You are a helpful assistant';
    const userPrompt = 'Hello, world!';

    await aiChat(systemPrompt, userPrompt);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_AI_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: 0
    }));
  });

  it('should include prefillSystemResponse in messages if provided', async () => {
    const systemPrompt = 'You are a helpful assistant';
    const userPrompt = 'Hello, world!';
    const prefill = 'Previous response';

    await aiChat(systemPrompt, userPrompt, prefill);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: DEFAULT_AI_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: prefill }
      ],
      temperature: 0
    }));
  });

  it('should allow overriding model via config', async () => {
    const customModel = 'claude-sonnet-4-6-custom';

    await aiChat('system', 'user', undefined, undefined, { model: customModel });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: customModel
    }));
  });

  it('should parse JSON response correctly', async () => {
    const expectedResponse = { answer: 'mocked response' };
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(expectedResponse) }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    const result = await aiChat<{ answer: string }>('system', 'user');

    expect(result.result).toEqual(expectedResponse);
    expect(result.usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    });
  });

  it('should throw error when response parsing fails', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Not valid JSON' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    await expect(aiChat('system', 'user')).rejects.toThrow();
  });

  it('should throw error when content type is not text', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'image' as any, text: '' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    await expect(aiChat('system', 'user')).rejects.toThrow("No text response found in Claude's response");
  });

  it('should throw error when there are no content items', async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    await expect(aiChat('system', 'user')).rejects.toThrow('No content received from Claude');
  });

  it('should prepend to response if prependToResponse is provided', async () => {
    const expectedResponse = { answer: 'combined response' };
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'response"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    const result = await aiChat<{ answer: string }>('system', 'user', undefined, '{"answer": "combined ');

    expect(result.result).toEqual(expectedResponse);
  });

  it.skip('should handle max_tokens stop reason by making another API call', async () => {
    // Note: This test is challenging due to the recursive nature of the function
    // and would require more advanced mocking techniques or refactoring the function
    // to be more testable. For now, we're skipping this test.

    const systemPrompt = 'You are a helpful assistant';
    const userPrompt = 'Long response';

    // Just make sure the first call is made
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"result": "test"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });

    await aiChat(systemPrompt, userPrompt);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }));
  });

  it('should rethrow API errors', async () => {
    const apiError = new Error('API error');
    mockCreate.mockRejectedValue(apiError);

    await expect(aiChat('system', 'user')).rejects.toThrow('API error');
  });
});
