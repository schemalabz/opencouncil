import About from "@/components/about/AboutPage"
import { Metadata } from "next"
import { getTranslations } from 'next-intl/server'
import { getSupportedCitiesWithLogosCached, getAboutPageStatsCached, getGitHubStatsCached } from '@/lib/cache/queries'
import { buildCanonicalAlternates } from '@/lib/utils/hreflang'
import { getRealm } from '@/lib/realm.server'
import { getRealmBaseUrl, getRealmStage } from '@/lib/realm'
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl'
import type { Realm } from '@prisma/client'
import { buildOgImageUrl } from '@/lib/og/locale'

export async function generateMetadata(
    props: {
        params: Promise<{ locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        locale
    } = params;

    const t = await getTranslations('about.metadata')

    const title = t('title')
    const description = t('description')
    const keywords = t('keywords').split(',')

    const ogImageUrl = buildOgImageUrl(locale, { pageType: 'about' });

    return {
        title,
        description,
        keywords,
        authors: [{ name: 'OpenCouncil Team' }],
        openGraph: {
            title,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: title,
                }
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [ogImageUrl],
            creator: '@opencouncil',
            site: '@opencouncil'
        },
        alternates: await buildCanonicalAlternates('/about'),
        other: {
            'about:mission': 'transparency',
            'about:technology': 'artificial-intelligence',
            'about:focus': 'municipal-councils',
        }
    };
}

/**
 * Where a crest in the strip links. A pending realm shows the active realms'
 * municipalities as proof, and city pages are tenant-isolated, so a city on
 * another realm links to that realm's own domain. On a preview or localhost the
 * base URL is the instance itself; `?realm=` switches it to the city's realm.
 */
function cityHref(city: { id: string; realm: Realm }, currentRealm: Realm): string {
    if (!city.realm || city.realm === currentRealm) return `/${city.id}`
    const base = realmBaseUrl(city.realm)
    const canonical = base === getRealmBaseUrl(city.realm)
    return `${base}/${city.id}${canonical ? '' : `?realm=${city.realm}`}`
}

export default async function AboutPage() {
    const realm = await getRealm();
    // A realm still after its first pilot asks for that pilot instead of quoting prices.
    const stage = getRealmStage(realm);
    const [citiesWithLogos, stats, githubStats] = await Promise.all([
        getSupportedCitiesWithLogosCached().catch(error => {
            console.error('Failed to fetch cities with logos:', error);
            return [];
        }),
        getAboutPageStatsCached().catch(error => {
            console.error('Failed to fetch about page stats:', error);
            return null;
        }),
        getGitHubStatsCached().catch(error => {
            console.error('Failed to fetch GitHub stats:', error);
            return null;
        }),
    ]);
    const cities = citiesWithLogos.map(city => ({ ...city, href: cityHref(city, realm) }))
    return <About citiesWithLogos={cities} stats={stats} githubStats={githubStats} realm={realm} stage={stage} />
}
