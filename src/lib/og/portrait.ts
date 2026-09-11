import 'server-only';
import sharp from 'sharp';

// Only our public image origins may be fetched by an anonymous image request.
const PORTRAIT_HOSTS = new Set(['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com']);
const MAX_PORTRAIT_BYTES = 2_000_000;

export async function getPortraitData(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;
    try {
        const target = new URL(url);
        if (target.protocol !== 'https:' || target.username || target.password || target.port || !PORTRAIT_HOSTS.has(target.hostname)) return null;
        const response = await fetch(target.href, { redirect: 'error', signal: AbortSignal.timeout(3000) });
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || !type || !['image/png', 'image/jpeg', 'image/webp'].includes(type) || Number(response.headers.get('content-length')) > MAX_PORTRAIT_BYTES) {
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
                if (size > MAX_PORTRAIT_BYTES) return null;
                chunks.push(value);
            }
        } finally { await reader.cancel(); }
        // Bound decoded pixels as well as download size. The renderer receives
        // a small embedded PNG and cannot make another network request.
        const png = await sharp(Buffer.concat(chunks), { limitInputPixels: 4_000_000, animated: false })
            .resize(256, 256, { fit: 'cover', withoutEnlargement: true }).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch { return null; } // A missing portrait must not prevent sharing.
}
