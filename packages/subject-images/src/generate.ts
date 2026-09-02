import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from './constants';
import { UnreadableImageError, sniffImageType } from './image';
import { SYSTEM_PROMPT } from './prompt';

export const IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

/** Well over the canonical size; a 40 KB PNG can declare 250 megapixels, about a gigabyte decoded. */
export const MAX_INPUT_PIXELS = IMAGE_WIDTH * IMAGE_HEIGHT * 16;

export interface GenerateDeps {
    apiKey: string;
}

/**
 * Bring any image to the canonical WebP 1344×768 (cover crop). Refuses bytes
 * that are not a raster (sharp would hand an SVG to librsvg) and an image that
 * would decode past MAX_INPUT_PIXELS, with UnreadableImageError either way.
 */
export async function toWebp(image: Buffer): Promise<Buffer> {
    if (!sniffImageType(image)) {
        throw new UnreadableImageError('Not a JPEG, PNG, WebP, GIF or AVIF image');
    }
    try {
        return await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
            .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover' })
            .webp({ quality: 82 })
            .toBuffer();
    } catch (error) {
        throw new UnreadableImageError(`Image could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Ask Gemini for one image of the subject and return it as WebP 1344×768.
 * `prompt` is the user message from buildPrompt; the style and the rules go
 * as the system instruction. The model draws at 16:9 (1344×768 at 1K), so
 * the resize is a no-op unless the model returns another size.
 */
export async function generate(prompt: string, deps: GenerateDeps): Promise<Buffer> {
    const ai = new GoogleGenAI({ apiKey: deps.apiKey });
    const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseModalities: ['IMAGE'],
            imageConfig: { aspectRatio: '16:9', imageSize: '1K' },
        },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const data = parts.find((part) => part.inlineData?.data)?.inlineData?.data;
    if (!data) {
        throw new Error(`Gemini returned no image for model ${IMAGE_MODEL}`);
    }

    return toWebp(Buffer.from(data, 'base64'));
}
