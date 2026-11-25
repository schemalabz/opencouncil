import { aiChat, ResultWithUsage } from '../ai';
import Anthropic from '@anthropic-ai/sdk';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
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

// Mock env.mjs (ESM module that jest can't import directly)
jest.mock('@/env.mjs', () => ({
  env: {}
}));

describe('aiChat', () => {
  // Use this for direct access to the mocked create function
  const mockCreate = ((Anthropic as unknown as jest.Mock).mock.results[0]?.value.messages.create || jest.fn()) as jest.Mock;
  
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
    
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      output_config: { effort: 'low' }
    });
  });

  it('should send the previous output as user context', async () => {
    const systemPrompt = 'You are a helpful assistant';
    const userPrompt = 'Hello, world!';
    const prefill = 'Previous response';
    
    await aiChat(systemPrompt, userPrompt, prefill);
    
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: expect.stringContaining(JSON.stringify(prefill)) }
      ],
      output_config: { effort: 'low' }
    });
  });

  it('uses a caller model override without the default model effort setting', async () => {
    await aiChat('Return JSON', 'Extract a city', undefined, undefined, { model: 'claude-haiku-4-5', maxTokens: 512 });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: 'Return JSON',
      messages: [{ role: 'user', content: 'Extract a city' }],
    });
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
    
    await expect(aiChat('system', 'user')).rejects.toThrow("No content received from Claude");
  });

  it('should prepend to response if prependToResponse is provided', async () => {
    const expectedResponse = { answer: 'combined response' };
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"answer": "response"}' }],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      stop_reason: "end_turn"
    });
    
    // Mock JSON.parse to handle our specific test case
    const originalJSONParse = JSON.parse;
    global.JSON.parse = jest.fn().mockImplementation((text) => {
      if (text.includes('combined')) {
        return expectedResponse;
      }
      return originalJSONParse(text);
    });
    
    const result = await aiChat<{ answer: string }>('system', 'user', undefined, '{"answer": "combined ');
    
    // Restore original JSON.parse
    global.JSON.parse = originalJSONParse;
    
    expect(result.result).toEqual(expectedResponse);
  });

  it('continues a truncated JSON response without an assistant prefill', async () => {
    const prefix = '{"answer":"Athens ';
    const usage = { input_tokens: 2, output_tokens: 3 };
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: prefix }], usage, stop_reason: 'max_tokens' })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'council"}' }], usage, stop_reason: 'end_turn' });

    const response = await aiChat<{ answer: string }>('Return JSON', 'Name the body');

    expect(response.result).toEqual({ answer: 'Athens council' });
    expect(response.usage).toMatchObject({ input_tokens: 4, output_tokens: 6 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messages: [{ role: 'user', content: expect.stringContaining(JSON.stringify(prefix)) }],
    }));
  });

  it('should rethrow API errors', async () => {
    const apiError = new Error('API error');
    mockCreate.mockRejectedValue(apiError);
    
    await expect(aiChat('system', 'user')).rejects.toThrow('API error');
  });
});
