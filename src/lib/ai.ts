import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '@/env.mjs';
import { IS_DEV } from './utils';

dotenv.config();

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
export type ResultWithUsage<T> = { result: T, usage: Anthropic.Messages.Usage };

// Configuration types
export interface AIConfig {
    maxTokens?: number;
    temperature?: number;
    model?: string;
    logPrompts?: boolean;
    promptsDir?: string;
    enableWebSearch?: boolean;
    webSearchMaxUses?: number;
}

// Default configuration
const DEFAULT_CONFIG: AIConfig = {
    maxTokens: 8192,
    temperature: 0,
    model: "claude-sonnet-4-0",
    logPrompts: IS_DEV,
    promptsDir: path.join(process.cwd(), 'logs', 'prompts'),
    enableWebSearch: false,
    webSearchMaxUses: 10
};

let lastUseTimestamp = 0;

// Utility function to log prompts
function logPromptToFile(
    systemPrompt: string,
    messages: any[],
    config: AIConfig,
    metadata: Record<string, any> = {}
) {
    if (!config.logPrompts || !config.promptsDir) return;

    try {
        // Ensure the path is within the project directory
        const projectRoot = process.cwd();
        const promptsDir = path.join(projectRoot, 'logs', 'prompts');

        // Ensure the logs directory exists
        if (!fs.existsSync(promptsDir)) {
            fs.mkdirSync(promptsDir, { recursive: true });
        }

        // Create a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(promptsDir, `prompt-${timestamp}.json`);

        // Create the log object
        const logObject = {
            timestamp,
            systemPrompt,
            messages,
            metadata: {
                ...metadata,
                nodeEnv: process.env.NODE_ENV,
                maxTokens: config.maxTokens,
                model: config.model,
            }
        };

        // Write to file
        fs.writeFileSync(filename, JSON.stringify(logObject, null, 2));
        console.log(`[Dev] Prompt logged to ${filename}`);
    } catch (error) {
        console.error('[Dev] Error logging prompt:', error);
    }
}

// Utility function to log responses
function logResponseToFile(
    response: Anthropic.Messages.Message,
    config: AIConfig,
    metadata: Record<string, any> = {}
) {
    if (!config.logPrompts || !config.promptsDir) return;

    try {
        // Ensure the path is within the project directory
        const projectRoot = process.cwd();
        const responsesDir = path.join(projectRoot, 'logs', 'responses');

        // Ensure the logs directory exists
        if (!fs.existsSync(responsesDir)) {
            fs.mkdirSync(responsesDir, { recursive: true });
        }

        // Create a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(responsesDir, `response-${timestamp}.json`);

        // Create the log object with full response data
        const logObject = {
            timestamp,
            response: {
                id: response.id,
                type: response.type,
                role: response.role,
                content: response.content,
                model: response.model,
                stop_reason: response.stop_reason,
                stop_sequence: response.stop_sequence,
                usage: response.usage
            },
            metadata: {
                ...metadata,
                nodeEnv: process.env.NODE_ENV,
                contentBlockCount: response.content?.length || 0,
                contentTypes: response.content?.map(block => block.type) || [],
            }
        };

        // Write to file
        fs.writeFileSync(filename, JSON.stringify(logObject, null, 2));
        console.log(`[Dev] Response logged to ${filename}`);
    } catch (error) {
        console.error('[Dev] Error logging response:', error);
    }
}

// Helper function to extract and parse JSON from AI responses
function extractAndParseJSON<T>(content: string, debug: boolean = false): T {
    if (debug) {
        console.log(`[JSON Extract] Content length: ${content.length}`);
        console.log(`[JSON Extract] Content preview:`, content.substring(0, 200));
    }

    // Try direct parsing first
    try {
        return JSON.parse(content) as T;
    } catch (e) {
        if (debug) {
            console.log(`[JSON Extract] Direct parse failed, trying fixes...`);
        }
    }

    // Common fixes for malformed JSON
    let fixedContent = content.trim();

    // Fix 1: Add missing opening brace if content starts with a key
    if (fixedContent.match(/^"[^"]+"\s*:/)) {
        fixedContent = '{' + fixedContent;
        if (debug) {
            console.log(`[JSON Extract] Added missing opening brace`);
        }
    }

    // Fix 2: Add missing closing brace if content ends abruptly
    if (fixedContent.startsWith('{') && !fixedContent.endsWith('}')) {
        // Count braces to see if we need to close
        const openBraces = (fixedContent.match(/\{/g) || []).length;
        const closeBraces = (fixedContent.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
            fixedContent = fixedContent + '}';
            if (debug) {
                console.log(`[JSON Extract] Added missing closing brace`);
            }
        }
    }

    // Fix 3: Remove trailing comma before closing brace
    fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1');

    // Fix 4: Try to extract JSON from markdown code blocks
    const codeBlockMatch = fixedContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        fixedContent = codeBlockMatch[1];
        if (debug) {
            console.log(`[JSON Extract] Extracted from code block`);
        }
    }

    // Try parsing the fixed content
    try {
        const result = JSON.parse(fixedContent) as T;
        if (debug) {
            console.log(`[JSON Extract] Successfully parsed after fixes`);
        }
        return result;
    } catch (e) {
        if (debug) {
            console.log(`[JSON Extract] All fixes failed, final content:`, fixedContent.substring(0, 500));
        }
        throw new Error(`Failed to parse JSON even after fixes: ${e}`);
    }
}

export async function aiChat<T>(
    systemPrompt: string,
    userPrompt: string,
    prefillSystemResponse?: string,
    prependToResponse?: string,
    config: Partial<AIConfig> = {}
): Promise<ResultWithUsage<T>> {
    lastUseTimestamp = Date.now();

    // Merge with default config
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    try {
        console.log(`Sending message to claude...`);
        let messages: Anthropic.Messages.MessageParam[] = [];
        messages.push({ "role": "user", "content": userPrompt });
        if (prefillSystemResponse) {
            messages.push({ "role": "assistant", "content": prefillSystemResponse });
        }

        let response: Anthropic.Messages.Message;
        try {
            const requestConfig: Anthropic.Messages.MessageCreateParams = {
                model: mergedConfig.model!,
                max_tokens: mergedConfig.maxTokens!,
                system: systemPrompt,
                messages,
                temperature: mergedConfig.temperature,
            };

            // Add web search tool if enabled
            if (mergedConfig.enableWebSearch) {
                requestConfig.tools = [
                    {
                        type: "web_search_20250305",
                        name: "web_search",
                        max_uses: mergedConfig.webSearchMaxUses!
                    }
                ];
            }

            response = await anthropic.messages.create(requestConfig);
        } catch (e) {
            console.error(`Error in aiChat: ${e}`);
            throw e;
        }

        // Log the prompt if enabled
        logPromptToFile(systemPrompt, messages, mergedConfig);

        // Log the full response if enabled
        logResponseToFile(response, mergedConfig, {
            systemPrompt: systemPrompt.substring(0, 100) + '...',
            userPrompt: userPrompt.substring(0, 100) + '...',
            enableWebSearch: mergedConfig.enableWebSearch
        });

        if (!response.content || response.content.length === 0) {
            throw new Error("No content received from Claude");
        }

        // Log content structure for debugging (only in development)
        if (mergedConfig.logPrompts) {
            console.log(`[AI Debug] Received ${response.content.length} content blocks:`);
            response.content.forEach((block, index) => {
                const preview = block.type === 'text' ?
                    ` (${(block as any).text?.substring(0, 50)}...)` : '';
                console.log(`[AI Debug] Block ${index}: type=${block.type}${preview}`);
            });
            console.log(`[AI Debug] Stop reason: ${response.stop_reason}`);
            console.log(`[AI Debug] Usage:`, response.usage);
        }

        // Find the final text response (may be multiple blocks with web search)
        const textBlocks = response.content.filter(block => block.type === "text");
        if (textBlocks.length === 0) {
            throw new Error("No text response found in Claude's response. Content types: " +
                response.content.map(b => b.type).join(", "));
        }

        // Use the last text block as the final response
        const finalTextBlock = textBlocks[textBlocks.length - 1] as Anthropic.Messages.TextBlock;

        if (response.stop_reason === "max_tokens") {
            console.log(`Claude stopped because it reached the max tokens of ${mergedConfig.maxTokens}`);
            console.log(`Attempting to continue with a longer response...`);
            const response2 = await aiChat<T>(
                systemPrompt,
                userPrompt,
                (prefillSystemResponse + finalTextBlock.text).trim(),
                (prependToResponse + finalTextBlock.text).trim(),
                mergedConfig
            );
            return {
                usage: {
                    input_tokens: response.usage.input_tokens + response2.usage.input_tokens,
                    output_tokens: response.usage.output_tokens + response2.usage.output_tokens,
                    cache_creation_input_tokens: (response.usage.cache_creation_input_tokens || 0) + (response2.usage.cache_creation_input_tokens || 0),
                    cache_read_input_tokens: (response.usage.cache_read_input_tokens || 0) + (response2.usage.cache_read_input_tokens || 0),
                    server_tool_use: response.usage.server_tool_use || null,
                    service_tier: response.usage.service_tier || null
                },
                result: response2.result
            }
        }

        let responseContent = finalTextBlock.text;
        if (prependToResponse) {
            responseContent = prependToResponse + responseContent;
        }

        // Try to extract and fix JSON from the response
        let responseJson: T;
        try {
            responseJson = extractAndParseJSON<T>(responseContent, mergedConfig.logPrompts || false);
        } catch (e) {
            console.error(`Error parsing JSON from response. Content (first 200 chars):`, responseContent.slice(0, 200));
            console.error(`Full content length: ${responseContent.length}`);
            if (mergedConfig.logPrompts) {
                console.error(`Full content:`, responseContent);
            }
            throw e;
        }

        return {
            usage: response.usage,
            result: responseJson
        };
    } catch (e) {
        console.error(`Error in aiChat: ${e}`);
        throw e;
    }
}

export async function aiChatStream(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    config: Partial<AIConfig> = {}
): Promise<AsyncIterable<Anthropic.Messages.MessageStreamEvent>> {
    // Merge with default config
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Log the prompt if enabled
    logPromptToFile(systemPrompt, messages, mergedConfig, { streaming: true });

    const requestConfig: Anthropic.Messages.MessageCreateParams = {
        model: mergedConfig.model!,
        max_tokens: mergedConfig.maxTokens!,
        system: systemPrompt,
        messages,
        temperature: mergedConfig.temperature,
        stream: true,
    };

    // Add web search tool if enabled
    if (mergedConfig.enableWebSearch) {
        requestConfig.tools = [
            {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: mergedConfig.webSearchMaxUses!
            }
        ];
    }

    return anthropic.messages.create(requestConfig);
}