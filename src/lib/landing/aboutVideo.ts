import type { Realm } from '@prisma/client';

/** The one-minute film about OpenCouncil and Νότης, offered from the landing's "?" drawer. */
export type AboutVideo = {
    /** 1080p60 H.264/AAC, faststart */
    src: string;
    /** the first scene (the council's hemicycle), for the player before it starts */
    poster: string;
    /** the hemicycle, cropped for the drawer's small preview */
    thumb: string;
    /** how long it runs, as a player shows it */
    duration: string;
};

// The bucket's `explain/` folder, through the CDN (as src/lib/explain/articles.tsx links it). The
// keys are versioned and served `immutable`: a new cut is uploaded as `-v2`, never over `-v1`.
const BASE = 'https://data.opencouncil.gr/explain';

/**
 * The film is in Greek, has no subtitles, and is about Greek municipalities (it names Athens and
 * opencouncil.gr). It is offered on the Greek realm only, the same line `hasExplainPage` draws for
 * /explain, and only in Greek: a reader of the realm's /en pages cannot follow it.
 */
export function aboutVideo(realm: Realm, locale: string): AboutVideo | null {
    if (realm !== 'greece' || locale !== 'el') return null;
    return {
        src: `${BASE}/oc-about-v1.mp4`,
        poster: `${BASE}/oc-about-v1-poster.jpg`,
        thumb: `${BASE}/oc-about-v1-thumb.jpg`,
        duration: '1:03',
    };
}
