"use client";
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { getLocalizedName } from '@/lib/formatters/name';
import { TIER_PARAM } from '@/lib/utils/bodyTier';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { MeetingRow, type MeetingBookends } from './CityMeetingsModule';

interface SecondaryBodiesCardProps {
    /** The city's secondary bodies with a released meeting. */
    bodies: PublicAdministrativeBody[];
    /** The bookend meetings of those bodies. */
    meetings: MeetingBookends;
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The rail card of a city's secondary bodies (#829). The meetings module
 * beside it never lists them, so this card is where a reader learns that the
 * body exists and when it met. The link opens the meetings tab with the tier
 * widened to it.
 */
export function SecondaryBodiesCard({ bodies, meetings, cityId, timezone, locale }: SecondaryBodiesCardProps) {
    const t = useTranslations('cityOverview');
    const tCommon = useTranslations('Common');

    if (bodies.length === 0) return null;

    // One secondary type exists, so the first body's type names them all. The
    // filter value is the type's label: the tab's picker keys its chips by it.
    const typeLabel = tCommon(`adminBodyType_${bodies[0].type}`);
    const href = `/${cityId}/meetings?${TIER_PARAM}=all&filters=${encodeURIComponent(typeLabel)}`;

    return (
        <div className={cn(surfaceCardClass, 'overflow-hidden')}>
            <div className="border-b border-border bg-muted/40 px-4 py-2">
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    {typeLabel}
                </span>
                <span className="mt-0.5 block truncate text-sm">
                    {bodies.map(body => getLocalizedName(body, locale)).join(' · ')}
                </span>
            </div>
            {meetings.next && (
                <MeetingRow entry={meetings.next} cityId={cityId} timezone={timezone} locale={locale} className="border-b border-border" />
            )}
            {meetings.latest && (
                <MeetingRow entry={meetings.latest} cityId={cityId} timezone={timezone} locale={locale} ariaLabel={t('viewMeeting')} />
            )}
            <Link
                href={href}
                prefetch={false}
                className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground hover:no-underline"
            >
                {t('allMeetingsOfBody')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
        </div>
    );
}
