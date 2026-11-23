import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { CtaButton } from '@/components/ui/cta-button';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { getLocalizedName } from '@/lib/formatters/name';
import { authorityKey } from './authorityKey';
import { RailDisclosure } from './RailDisclosure';

interface CityBodyFollowCardProps {
    city: { id: string; authorityType: string };
    /** The bodies of the city that a reader may follow (bodyOffersFollow), at least one. */
    bodies: PublicAdministrativeBody[];
    /** Whether the reader follows one of them already. */
    following: boolean;
    locale: string;
}

/**
 * The notifications of a municipality that does not support them, in the
 * place of the notification card: the updates of the secondary bodies that a
 * reader may follow there (#829). Their admin switched the updates on without
 * the municipality, so the city page is where a reader learns of them. The
 * petition card stays below it: the municipality itself is still not covered.
 *
 * A Server Component, like the notification card it stands in for.
 */
export function CityBodyFollowCard({ city, bodies, following, locale }: CityBodyFollowCardProps) {
    const t = useTranslations('cityOverview');
    const names = bodies.map(body => getLocalizedName(body, locale)).join(' · ');
    // One body: the signup starts with its tick on, as from the page of the body.
    const href = bodies.length === 1 && !following
        ? `/${city.id}/notifications?step=2&body=${bodies[0].id}`
        : `/${city.id}/notifications?step=2`;

    return (
        <RailDisclosure summary={t('bodyFollowTeaser')}>
            <div className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 max-lg:border-t">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={34}
                    height={34}
                    className="h-[34px] w-[34px] shrink-0 rounded-full object-contain"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight">{names}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t('bodyFollowSubtitle')}</span>
                </span>
            </div>

            {following ? (
                <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
                    <p className="text-sm leading-snug text-muted-foreground">{t('bodyFollowFollowing', { count: bodies.length })}</p>
                    <Link href={href} className="text-xs font-semibold text-[hsl(var(--orange))]">
                        {t('changePreferences')}
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                    <p className="text-sm leading-snug text-muted-foreground">{t(authorityKey('bodyFollowBody', city), { count: bodies.length })}</p>
                    <CtaButton
                        href={href}
                        event="body_follow_cta_clicked"
                        eventProps={{ surface: 'city_rail', city_id: city.id, bodies: bodies.length }}
                        className="flex max-w-sm"
                    >
                        {t('notisCta')}
                    </CtaButton>
                    <p className="max-w-sm text-center text-[11px] text-muted-foreground">{t('notisChannels')}</p>
                </div>
            )}
        </RailDisclosure>
    );
}
