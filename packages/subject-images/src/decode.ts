// Server only: sharp needs Node.js and native libraries. image.ts stays
// free of it, because browser code reads its upload types.
import sharp from 'sharp';
import { sniffImageType, UnreadableImageError, type UploadImageType } from './image';

/**
 * The real type of an image that decodes in full within `maxPixels`. The
 * first bytes alone pass a truncated file, or a few hundred kilobytes that
 * declare a quarter of a gigapixel, which every later decode then pays for.
 * Throws UnreadableImageError for anything else.
 */
export async function decodableImageType(image: Buffer, maxPixels: number): Promise<UploadImageType> {
    const type = sniffImageType(image);
    if (!type) throw new UnreadableImageError('not a JPEG, PNG, WebP, GIF or AVIF image');
    // stats() decodes every pixel without holding the decoded image: a raw
    // buffer of a 24-megapixel photo is 72 MB, and copies run in parallel.
    // The pipeline is built outside the try, so a wrong option throws as it is.
    const pipeline = sharp(image, { limitInputPixels: maxPixels, failOn: 'error' });
    try {
        await pipeline.stats();
    } catch (error) {
        throw new UnreadableImageError(`the ${type} could not be read (${error instanceof Error ? error.message : String(error)})`);
    }
    return type;
}
