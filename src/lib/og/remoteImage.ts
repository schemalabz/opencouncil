import 'server-only';
import path from 'path';
import sharp from 'sharp';

// Only our public image origins may be fetched by an anonymous image request.
const TRUSTED_HOSTS = new Set(['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com']);
const MAX_BYTES = 2_000_000;

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
        const target = new URL(url);
        const trusted = TRUSTED_HOSTS.has(target.hostname) || extraHosts.includes(target.hostname);
        if (target.protocol !== 'https:' || target.username || target.password || target.port || !trusted) return null;
        const response = await fetch(target.href, { redirect: 'error', signal: AbortSignal.timeout(3000) });
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || !type || !['image/png', 'image/jpeg', 'image/webp'].includes(type) || Number(response.headers.get('content-length')) > MAX_BYTES) {
            await response.body?.cancel();
            return null;
        }
        if (!response.body) return null;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_BYTES) return null;
                chunks.push(value);
            }
        } finally { await reader.cancel(); }
        const png = await sharp(Buffer.concat(chunks), { limitInputPixels: 4_000_000, animated: false })
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
        const png = await sharp(file, { limitInputPixels: 4_000_000 })
            .resize(box.width, box.height, { fit: box.fit ?? 'cover', withoutEnlargement: true }).png({ palette: Boolean(box.palette) }).toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch (error) {
        console.error(`[og] ${publicPath} could not be decoded:`, error);
        return null;
    }
}
