import type { Metadata } from 'next';

/** The link preview of shared content: a 1200×630 image and a large Twitter card. */
export function shareCardMetadata({ title, description, image, url }: { title: string; description: string; image: string; url?: string }): Metadata {
    return {
        title, description,
        openGraph: { title, description, ...(url ? { url } : {}), images: [{ url: image, width: 1200, height: 630 }] },
        twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
}
