"use client";
import { useTranslations } from 'next-intl';
import { useSelectedLayoutSegment } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
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
        <Link href={href} className={className}>
            {children}
        </Link>
    );
}

export function CityNavigation({ cityId, city }: CityNavigationProps) {
    const t = useTranslations('City');
    const segment = useSelectedLayoutSegment();

    // Convert segment to our view types
    const currentSegment = segment || 'meetings';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex justify-center mb-6 md:mb-8"
        >
            <div className="gap-1 sm:gap-2 md:gap-8 p-1 bg-background/80 backdrop-blur-sm w-full max-w-4xl flex justify-center rounded-lg overflow-x-auto scrollbar-hide">
                <NavLink
                    href={`/${cityId}`}
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
            </div>
        </motion.div>
    );
} 