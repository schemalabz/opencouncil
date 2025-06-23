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
}

// Default configuration
const DEFAULT_CONFIG: AIConfig = {
    maxTokens: 8192,
    temperature: 0,
    model: "claude-3-5-sonnet-20241022",
    logPrompts: IS_DEV,
    promptsDir: path.join(process.cwd(), 'logs', 'prompts')
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
            response = await anthropic.messages.create({
                model: mergedConfig.model!,
                max_tokens: mergedConfig.maxTokens!,
                system: systemPrompt,
                messages,
                temperature: mergedConfig.temperature,
            });
        } catch (e) {
            console.error(`Error in aiChat: ${e}`);
            throw e;
        }

        // Log the prompt if enabled
        logPromptToFile(systemPrompt, messages, mergedConfig);

        if (!response.content || response.content.length !== 1) {
            throw new Error("Expected 1 response from claude, got " + response.content?.length);
        }

        if (response.content[0].type !== "text") {
            throw new Error("Expected text response from claude, got " + response.content[0].type);
        }

        if (response.stop_reason === "max_tokens") {
            console.log(`Claude stopped because it reached the max tokens of ${mergedConfig.maxTokens}`);
            console.log(`Attempting to continue with a longer response...`);
            const response2 = await aiChat<T>(
                systemPrompt, 
                userPrompt, 
                (prefillSystemResponse + response.content[0].text).trim(), 
                (prependToResponse + response.content[0].text).trim(),
                mergedConfig
            );
            return {
                usage: {
                    input_tokens: response.usage.input_tokens + response2.usage.input_tokens,
                    output_tokens: response.usage.output_tokens + response2.usage.output_tokens,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0
                },
                result: response2.result
            }
        }

        let responseContent = response.content[0].text;
        if (prependToResponse) {
            responseContent = prependToResponse + responseContent;
        }

        let responseJson: T;
        try {
            responseJson = JSON.parse(responseContent) as T;
        } catch (e) {
            console.error(`Error in aiChat. Response started with ${responseContent.slice(0, 100)}`);
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

    return anthropic.messages.create({
        model: mergedConfig.model!,
        max_tokens: mergedConfig.maxTokens!,
        system: systemPrompt,
        messages,
        temperature: mergedConfig.temperature,
        stream: true,
    });
}