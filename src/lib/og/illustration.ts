import 'server-only';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { env } from '@/env.mjs';
import { resolveSubjectImage } from '@/lib/subjectImages';
import { getImageData, type ImageBox } from './remoteImage';

/** The boxes the images draw an illustration into, at twice the drawn size so the pixel art stays crisp. */
export const ILLUSTRATION_BOX = {
    hero: { width: 1200, height: 630, palette: true },
    tile: { width: 600, height: 343, palette: true },
    band: { width: 1080, height: 640, palette: true },
} satisfies Record<string, ImageBox>;

/** Twice the largest tile the static set is drawn in (216×123). */
const STATIC_BOX: ImageBox = { width: 432, height: 246, palette: true };

function cdnHosts(): string[] {
    try { return [new URL(env.CDN_URL).hostname]; } catch { return []; }
}

/**
 * A subject's illustration for an image, or `null` when none is stored yet.
 * The URL is resolved with its ETag, so a picture an admin replaced is fetched
 * anew and not from the CDN's immutable copy of the old one.
 */
export async function getSubjectIllustrationData(subjectId: string, box: ImageBox): Promise<string | null> {
    const resolved = await resolveSubjectImage(subjectId).catch(() => null);
    return getImageData(resolved?.url, box, cdnHosts());
}

/** Whether every subject asked for had a picture; the cache policy of an image depends on it. */
export const allIllustrated = (pictures: Map<string, string | null>): boolean => [...pictures.values()].every(Boolean);

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
 * unfurl every share of the bare domain hits. Decoded once per process; a
 * file that cannot be decoded drops out of the set instead of failing it.
 */
export function getStaticIllustrations(): Promise<string[]> {
    staticIllustrations ??= (async () => {
        let files: string[];
        try { files = fs.readdirSync(STATIC_DIR).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).sort(); } catch { return []; }
        const pictures = await Promise.all(files.map(async file => {
            try {
                const png = await sharp(path.join(STATIC_DIR, file))
                    .resize(STATIC_BOX.width, STATIC_BOX.height, { fit: 'cover', withoutEnlargement: true }).png({ palette: true }).toBuffer();
                return `data:image/png;base64,${png.toString('base64')}`;
            } catch (error) {
                console.error(`[og] static illustration ${file} could not be decoded:`, error);
                return null;
            }
        }));
        return pictures.filter((picture): picture is string => picture !== null);
    })();
    return staticIllustrations;
}
