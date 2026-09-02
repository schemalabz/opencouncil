import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { generate, toWebp, IMAGE_MODEL, MAX_INPUT_PIXELS } from '../generate';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '../constants';
import { sniffImageType, UnreadableImageError } from '../image';
import { SYSTEM_PROMPT } from '../prompt';

const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
        models: { generateContent: (...args: unknown[]) => mockGenerateContent(...args) },
    })),
}));

async function pngOf(width: number, height: number): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();
}

/** A valid PNG signature and header that declares `width`×`height`, and nothing after it. */
function pngHeaderOf(width: number, height: number): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: RGB
    const chunk = Buffer.concat([Buffer.from('IHDR'), ihdr]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(13, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(chunk), 0);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, chunk, crc]);
}

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');

beforeEach(() => {
    mockGenerateContent.mockReset();
});

describe('sniffImageType', () => {
    it('reads the type from the first bytes', async () => {
        expect(sniffImageType(await pngOf(2, 2))).toBe('image/png');
        expect(sniffImageType(await sharp(await pngOf(2, 2)).jpeg().toBuffer())).toBe('image/jpeg');
        expect(sniffImageType(await sharp(await pngOf(2, 2)).webp().toBuffer())).toBe('image/webp');
        expect(sniffImageType(await sharp(await pngOf(2, 2)).gif().toBuffer())).toBe('image/gif');
        expect(sniffImageType(Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(8)]))).toBe('image/avif');
    });

    it('returns null for an SVG, a text file, and a few bytes', () => {
        expect(sniffImageType(SVG)).toBeNull();
        expect(sniffImageType(Buffer.from('hello, this is not an image at all'))).toBeNull();
        expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    });
});

describe('toWebp', () => {
    it('produces a 1344×768 WebP whatever the input size', async () => {
        const out = await toWebp(await pngOf(400, 400));
        const meta = await sharp(out).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(IMAGE_WIDTH);
        expect(meta.height).toBe(IMAGE_HEIGHT);
    });

    it('refuses bytes that are not a raster, whatever the client declared', async () => {
        await expect(toWebp(SVG)).rejects.toThrow(UnreadableImageError);
        await expect(toWebp(SVG)).rejects.toThrow('Not a JPEG, PNG, WebP, GIF or AVIF image');
    });

    it('refuses an image that would decode past the pixel limit', async () => {
        // A flat image just over the limit: tens of KB on disk, tens of MB decoded.
        const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1;
        const oversized = toWebp(await pngOf(side, side));
        await expect(oversized).rejects.toThrow(UnreadableImageError);
        await expect(oversized).rejects.toThrow(/pixel limit/);
    });

    it('refuses a raster whose data sharp cannot decode', async () => {
        await expect(toWebp(pngHeaderOf(10, 10))).rejects.toThrow(UnreadableImageError);
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
