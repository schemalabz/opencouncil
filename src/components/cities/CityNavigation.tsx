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
    activeClassName = 'bg-background text-foreground shadow-sm',
    inactiveClassName = 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
}: NavLinkProps) {
    const isActive = segment === matchSegment;
    const className = `px-2 sm:px-3 md:px-6 py-2 text-xs sm:text-sm md:text-base whitespace-nowrap transition-colors rounded-md flex-shrink-0 ${isActive ? activeClassName : inactiveClassName
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
        <div className="flex justify-center mb-6 md:mb-8">
            <nav aria-label={t('citySections')} className="gap-1 sm:gap-2 md:gap-8 p-1 bg-background/80 backdrop-blur-sm w-full max-w-4xl flex justify-center rounded-lg overflow-x-auto scrollbar-hide">
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