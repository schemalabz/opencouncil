import sharp from 'sharp';

const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: { generateContent: (...args: unknown[]) => mockGenerateContent(...args) },
    })),
}));

import { GoogleGenAI } from '@google/genai';
import { generate, toWebp, IMAGE_MODEL } from '../generate';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '../constants';
import { SYSTEM_PROMPT } from '../prompt';

async function pngOf(width: number, height: number): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();
}

beforeEach(() => {
    mockGenerateContent.mockReset();
});

describe('toWebp', () => {
    it('produces a 1344×768 WebP whatever the input size', async () => {
        const out = await toWebp(await pngOf(400, 400));
        const meta = await sharp(out).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(IMAGE_WIDTH);
        expect(meta.height).toBe(IMAGE_HEIGHT);
    });
});

describe('generate', () => {
    it('passes the key and the prompt to Gemini and converts the reply', async () => {
        const png = await pngOf(1344, 768);
        mockGenerateContent.mockResolvedValue({
            candidates: [{ content: { parts: [{ text: 'here you go' }, { inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }],
        });

        const out = await generate('a prompt', { apiKey: 'key' });

        expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'key' });
        expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
            model: IMAGE_MODEL,
            contents: 'a prompt',
            config: expect.objectContaining({ systemInstruction: SYSTEM_PROMPT }),
        }));
        expect((await sharp(out).metadata()).format).toBe('webp');
    });

    it('throws when the reply carries no image', async () => {
        mockGenerateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] });
        await expect(generate('a prompt', { apiKey: 'key' })).rejects.toThrow('no image');
    });
});
