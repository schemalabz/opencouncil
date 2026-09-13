import 'server-only';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { env } from '@/env.mjs';
import { publicSubjectImageUrl } from '@/lib/subjectImages';
import { getImageData, type ImageBox } from './remoteImage';

/** The boxes the images draw an illustration into, at twice the drawn size so the pixel art stays crisp. */
export const ILLUSTRATION_BOX = {
    hero: { width: 1200, height: 630 },
    tile: { width: 600, height: 343 },
    band: { width: 1080, height: 640 },
} satisfies Record<string, ImageBox>;

function cdnHosts(): string[] {
    try { return [new URL(env.CDN_URL).hostname]; } catch { return []; }
}

/** A subject's illustration for an image, or `null` when none is stored yet. */
export function getSubjectIllustrationData(subjectId: string, box: ImageBox): Promise<string | null> {
    return getImageData(publicSubjectImageUrl(subjectId), box, cdnHosts());
}

/** The illustrations of several subjects at once; a subject with none maps to `null`. */
export async function getSubjectIllustrations(subjectIds: string[], box: ImageBox): Promise<Map<string, string | null>> {
    const ids = [...new Set(subjectIds)];
    const data = await Promise.all(ids.map(id => getSubjectIllustrationData(id, box)));
    return new Map(ids.map((id, i) => [id, data[i]]));
}

const STATIC_DIR = path.join(process.cwd(), 'public', 'og', 'illustrations');
let staticIllustrations: Promise<string[]> | null = null;

/**
 * A fixed set of illustrations shipped with the build, for the images that
 * must read nothing from the database: the landing and about pages, whose
 * unfurl every share of the bare domain hits. Decoded once per process.
 */
export function getStaticIllustrations(): Promise<string[]> {
    staticIllustrations ??= (async () => {
        let files: string[];
        try { files = fs.readdirSync(STATIC_DIR).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).sort(); } catch { return []; }
        return Promise.all(files.map(async file => {
            const png = await sharp(path.join(STATIC_DIR, file)).png().toBuffer();
            return `data:image/png;base64,${png.toString('base64')}`;
        }));
    })();
    return staticIllustrations;
}
