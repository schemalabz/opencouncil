"use client";
import { useTranslations } from 'next-intl';
import { useSelectedLayoutSegment } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { ReactNode } from 'react';
import { City } from '@prisma/client';

type CityNavigationProps = {
    cityId: string;
    city?: { consultationsEnabled: boolean };
};

// Custom NavLink component to handle active state styling
type NavLinkProps = {
    href: string;
    children: ReactNode;
    segment: string | null;
    matchSegment: string | null;
    activeClassName?: string;
    inactiveClassName?: string;
};

function NavLink({
    href,
    children,
    segment,
    matchSegment,
    // An underline rather than a pill: the bar now sits left-aligned on a rule
    // under the identity band, where a floating pill reads as a separate control.
    activeClassName = 'text-foreground border-foreground',
    inactiveClassName = 'text-muted-foreground border-transparent hover:text-foreground',
}: NavLinkProps) {
    const isActive = segment === matchSegment;
    const className = `px-1 pb-3 text-sm md:text-base whitespace-nowrap transition-colors border-b-2 flex-shrink-0 hover:no-underline ${isActive ? activeClassName : inactiveClassName
        }`;

    return (
        <Link href={href} className={className} aria-current={isActive ? 'page' : undefined}>
            {children}
        </Link>
    );
}

export function CityNavigation({ cityId, city }: CityNavigationProps) {
    const t = useTranslations('City');
    const segment = useSelectedLayoutSegment();

    // The overview lives at the tab group's index route, so it has no segment of
    // its own. Every other tab is a folder and reports its own name.
    const currentSegment = segment || 'overview';

    return (
        // No entrance animation: this used to fade in on a 0.7s delay as the tail
        // of the old hero's choreography, which left the page's primary navigation
        // invisible on arrival — and permanently so if hydration was slow.
        <div className="mb-6 md:mb-8 border-b border-border">
            <nav aria-label={t('citySections')} className="flex gap-4 sm:gap-6 md:gap-7 overflow-x-auto scrollbar-hide -mb-px">
                <NavLink
                    href={`/${cityId}`}
                    segment={currentSegment}
                    matchSegment="overview"
                >
                    {t('overview')}
                </NavLink>
                <NavLink
                    href={`/${cityId}/meetings`}
                    segment={currentSegment}
                    matchSegment="meetings"
                >
                    {t('councilMeetings')}
                </NavLink>
                <NavLink
                    href={`/${cityId}/people`}
                    segment={currentSegment}
                    matchSegment="people"
                >
                    {t('people')}
                </NavLink>
                <NavLink
                    href={`/${cityId}/parties`}
                    segment={currentSegment}
                    matchSegment="parties"
                >
                    {t('parties')}
                </NavLink>
                {city?.consultationsEnabled && (
                    <NavLink
                        href={`/${cityId}/consultations`}
                        segment={currentSegment}
                        matchSegment="consultations"
                    >
                        {t('consultations')}
                    </NavLink>
                )}
            </nav>
        </div>
    );
} 