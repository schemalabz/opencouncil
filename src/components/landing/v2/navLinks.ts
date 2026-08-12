import type { Realm } from '@prisma/client';
import { REOPEN_CONSENT_EVENT } from '@/lib/utils/analyticsConsent';
import { getRealmContactPhone, telHref } from '@/lib/realm';

/* Footer-style link groups surfaced in the desktop "Περισσότερα" popover and the mobile
   drawer accordions. Mirrors the site footer (src/components/layout/Footer.tsx). */
export type FooterLink = {
    label: string;
    /** next-intl key under `landingV2` for the label; absent for literal contact rows */
    labelKey?: string;
    /** internal path (/x), external URL (http…), or tel:/mailto:; omitted for the cookie action */
    href?: string;
    /** open in a new tab (external http links) */
    external?: boolean;
    /** re-opens the analytics consent prompt instead of navigating */
    cookie?: boolean;
    /** opens the "pick your δήμος" notifications dialog instead of navigating */
    notify?: boolean;
    /** contact rows render a leading icon and are not hoverable */
    icon?: 'phone' | 'mail';
    /** highlighted as a CTA (accent colour + arrow) in the desktop "Περισσότερα" popover */
    featured?: boolean;
};

export type FooterGroup = { title: string; titleKey?: string; links: FooterLink[] };

const STATIC_GROUPS: FooterGroup[] = [
    {
        title: 'Σύνδεσμοι',
        titleKey: 'footer.groups.links',
        links: [
            { label: 'Για δήμους', labelKey: 'footer.links.forMunicipalities', href: '/about', featured: true },
            { label: 'Ειδοποιήσεις', labelKey: 'footer.links.notifications', notify: true },
            { label: 'Αναζήτηση', labelKey: 'footer.links.search', href: '/search' },
            { label: 'OpenCouncil AI', labelKey: 'footer.links.ai', href: '/mcp' },
            { label: 'API', labelKey: 'footer.links.api', href: '/docs' },
            { label: 'Θέσεις εργασίας', labelKey: 'footer.links.jobs', href: 'https://schemalabs.gr/jobs', external: true },
            { label: 'Status', labelKey: 'footer.links.status', href: 'https://status.opencouncil.gr', external: true },
        ],
    },
    {
        title: 'Πολιτικές και Όροι',
        titleKey: 'footer.groups.policies',
        links: [
            { label: 'Διορθώσεις', labelKey: 'footer.links.corrections', href: '/corrections' },
            { label: 'Πολιτική Απορρήτου', labelKey: 'footer.links.privacy', href: '/privacy' },
            { label: 'Όροι Χρήσης', labelKey: 'footer.links.terms', href: '/terms' },
            { label: 'Προτιμήσεις cookies', labelKey: 'footer.links.cookies', cookie: true },
        ],
    },
];

/**
 * The contact group, which depends on the realm: each domain shows its own
 * phone number. Appended to the static groups rather than living inside them, since
 * that array is a module constant and the number is not known until render.
 */
export function contactGroup(realm: Realm): FooterGroup {
    const phone = getRealmContactPhone(realm);
    return {
        title: 'Επικοινωνία',
        titleKey: 'footer.groups.contact',
        links: [
            { label: phone, href: telHref(phone), icon: 'phone' },
            { label: 'hello@opencouncil.gr', href: 'mailto:hello@opencouncil.gr', icon: 'mail' },
        ],
    };
}

/**
 * Every group in display order, contact last — what the popover and drawer render.
 * The static groups are deliberately not exported: they are an incomplete list,
 * and a caller reaching for them would silently get a menu with no contact row.
 */
export function footerGroups(realm: Realm): FooterGroup[] {
    return [...STATIC_GROUPS, contactGroup(realm)];
}

/** True for an internal app route (uses the i18n <Link>); false for tel:/mailto:/http. */
export function isInternalHref(href: string): boolean {
    return href.startsWith('/');
}

export function reopenCookiePreferences() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(REOPEN_CONSENT_EVENT));
}
