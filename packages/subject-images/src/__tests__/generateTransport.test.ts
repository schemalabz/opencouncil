import sharp from 'sharp';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '../constants';
import { generate, IMAGE_MODEL } from '../generate';

describe('Gemini transport for subject images', () => {
    afterEach(() => jest.restoreAllMocks());

    it('uses the image endpoint and converts a real SDK response to WebP', async () => {
        const png = await sharp({
            create: { width: 20, height: 20, channels: 3, background: '#336699' },
        }).png().toBuffer();
        const transport = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }],
        }));

        const output = await generate('A meeting about repainting a bench', { apiKey: 'test-key' });

        expect(transport).toHaveBeenCalledTimes(1);
        const request = new Request(...transport.mock.calls[0]);
        expect(new URL(request.url).pathname).toBe(`/v1beta/models/${IMAGE_MODEL}:generateContent`);
        expect(request.headers.get('x-goog-api-key')).toBe('test-key');
        expect(await request.json()).toMatchObject({
            contents: [{ role: 'user', parts: [{ text: 'A meeting about repainting a bench' }] }],
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '1K' } },
        });
        expect(await sharp(output).metadata()).toMatchObject({ format: 'webp', width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    });

    it('rejects an SDK response without an image', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ candidates: [] }));

        await expect(generate('An empty reply fixture', { apiKey: 'test-key' })).rejects.toThrow('Gemini returned no image');
    });

    it('propagates a quota failure from the SDK', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
            error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Fixture quota limit' },
        }, { status: 429 }));

        await expect(generate('A quota fixture', { apiKey: 'test-key' })).rejects.toMatchObject({ status: 429 });
    });
});
