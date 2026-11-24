import 'server-only';
import path from 'path';
import sharp from 'sharp';
import { fetchImageBytes } from '@/lib/fetchImage';
import { OG_IMAGE_TYPES, OG_MAX_IMAGE_BYTES, OG_MAX_IMAGE_PIXELS } from '@/lib/utils/imageUpload';
import { isPlainHttpsUrl, isStoredImageUrl } from '@/lib/utils/storedImageUrl';

export interface ImageBox {
    width: number;
    height: number;
    /** `cover` crops to the box (the default); `inside` keeps the whole picture within it. */
    fit?: 'cover' | 'inside';
    /** Quantise to 256 colours: a third of the bytes for the pixel-art illustrations, and wrong for a photograph. */
    palette?: boolean;
}

/** The city seal in a header chip: small, whole, on white. */
export const SEAL_BOX: ImageBox = { width: 88, height: 88, fit: 'inside' };

/**
 * Fetch a picture from one of our public origins and hand it to the renderer
 * as a small embedded PNG, sized to the box it will fill. The renderer then
 * makes no network request of its own, and every byte it decodes is bounded:
 * the download, the pixel count and the output size.
 *
 * `null` for anything that is not a trusted, well-formed raster: a missing
 * picture must never prevent an image from rendering.
 */
export async function getImageData(url: string | null | undefined, box: ImageBox, extraHosts: string[] = []): Promise<string | null> {
    if (!url) return null;
    try {
        // Only our public image origins may be fetched by an anonymous image request.
        const target = new URL(url);
        const trusted = isStoredImageUrl(url) || (isPlainHttpsUrl(target) && extraHosts.includes(target.hostname));
        if (!trusted) return null;
        const image = await fetchImageBytes(target.href, { maxBytes: OG_MAX_IMAGE_BYTES, timeoutMs: 3000, types: OG_IMAGE_TYPES });
        if (!image.ok) return null;
        const png = await sharp(image.bytes, { limitInputPixels: OG_MAX_IMAGE_PIXELS, animated: false })
            .resize(box.width, box.height, { fit: box.fit ?? 'cover', withoutEnlargement: true }).png({ palette: Boolean(box.palette) }).toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch { return null; }
}

/**
 * A picture shipped with the build, under `public/`, sized to its box and
 * embedded the same way: the product screenshots the about image shows.
 */
export async function getPublicImageData(publicPath: string, box: ImageBox): Promise<string | null> {
    try {
        const file = path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''));
        const png = await sharp(file, { limitInputPixels: OG_MAX_IMAGE_PIXELS })
            .resize(box.width, box.height, { fit: box.fit ?? 'cover', withoutEnlargement: true }).png({ palette: Boolean(box.palette) }).toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch (error) {
        console.error(`[og] ${publicPath} could not be decoded:`, error);
        return null;
    }
}
