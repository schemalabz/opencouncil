import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { canManageTeam, getCurrentUser } from '@/lib/auth';
import { getCityCached } from '@/lib/cache';
import { listCityGrantScopes, listGrants } from '@/lib/db/grants';
import { getLocalizedName } from '@/lib/formatters/name';
import { TeamTable } from '@/components/admin/team/TeamTable';

/**
 * The Team tab of a city (#875): who holds a role on the city, its bodies,
 * its parties and its people. Open to the admins of the city and to the
 * admins of its bodies, who see the bodies they hold; a 404 for everyone
 * else, as the widget page does, so the tab's existence tells nothing.
 */

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const { cityId, locale } = await props.params;
    const [city, t] = await Promise.all([getCityCached(cityId), getTranslations({ locale, namespace: 'team' })]);
    return {
        title: city ? `${t('title')} · ${getLocalizedName(city, locale)}` : t('title'),
        robots: { index: false, follow: false },
    };
}

export default async function TeamPage(props: { params: Promise<{ cityId: string; locale: string }> }) {
    const { cityId, locale } = await props.params;
    const [city, allowed, user] = await Promise.all([getCityCached(cityId), canManageTeam(cityId), getCurrentUser()]);
    if (!city || !allowed) notFound();

    const [grants, scopes] = await Promise.all([listGrants({ realms: null, cityId }), listCityGrantScopes(cityId)]);
    return (
        <TeamTable
            grants={grants}
            scopes={scopes}
            superadmin={user?.isSuperAdmin ?? false}
            city={{ id: city.id, name: getLocalizedName(city, locale) }}
        />
    );
}
