/**
 * What an upload may be, read from the bytes rather than from the declared
 * type: the client sets the latter, and sharp decodes whatever the former
 * says. SVG stays out on purpose — librsvg follows external references.
 */
export type UploadImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif';

export const UPLOAD_IMAGE_TYPES: readonly UploadImageType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** The bytes are not an image this library will decode. A caller answers 400, not 500. */
export class UnreadableImageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnreadableImageError';
    }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The image type the first bytes declare, or null for anything else. */
export function sniffImageType(image: Buffer): UploadImageType | null {
    if (image.length < 12) return null;
    if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'image/jpeg';
    if (image.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
    if (image.toString('latin1', 0, 4) === 'RIFF' && image.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
    const gif = image.toString('latin1', 0, 6);
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
    if (image.toString('latin1', 4, 8) === 'ftyp') {
        const brand = image.toString('latin1', 8, 12);
        if (brand === 'avif' || brand === 'avis') return 'image/avif';
    }
    return null;
}
