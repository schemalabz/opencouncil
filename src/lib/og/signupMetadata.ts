import type { Metadata } from 'next';
import { getOgLocale } from '@/i18n/config';
import { OG } from '@/components/og/frame';

/**
 * The unfurl of one signup step — the notifications flow and the petition,
 * with a municipality and without one.
 *
 * All four say the same things about themselves and differ only in their
 * title, their description and the image they point at, so they share this
 * rather than repeat it. The image URL is relative: Next resolves it against
 * `metadataBase`, which is the realm the request came in on.
 */
export function signupOpenGraph(locale: string, title: string, description: string, image: string): Metadata {
    return {
        openGraph: {
            title,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [{ url: image, width: OG.WIDTH, height: OG.HEIGHT, alt: title }],
            locale: getOgLocale(locale),
        },
        twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
}
