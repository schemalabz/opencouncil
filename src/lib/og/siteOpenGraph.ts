import type { Metadata } from 'next';

/**
 * The site-wide unfurl: what a page without its own `openGraph` shows.
 *
 * It carries no `url`. Next takes a parent's `openGraph` whole when a page
 * sets none, so a `url` here would make every such page name the homepage
 * as its `og:url`, and Facebook would merge its shares into the homepage's.
 */
export const siteOpenGraph = {
    title: 'OpenCouncil',
    description: 'Ανοιχτή τοπική αυτοδιοίκηση',
    type: 'website',
    images: [
        {
            url: '/oc-theme.png',
            width: 500,
            height: 500,
            alt: 'OpenCouncil Logo',
        },
    ],
} satisfies Metadata['openGraph'];
