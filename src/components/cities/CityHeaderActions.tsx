"use client";
import { City } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { isPetitionable } from '@/lib/cityStatus';

type CityHeaderActionsProps = {
    city: City;
};

/**
 * The band's public call to action: the petition, when the city is not yet
 * covered. Notifications used to live here too, and are now their own card.
 *
 * Kept apart from the band itself so the band stays a Server Component, and
 * apart from CityAdminTools so the two are not read as one control group: these
 * are addressed to citizens, those to operators.
 */
export function CityHeaderActions({ city }: CityHeaderActionsProps) {
    const t = useTranslations('City');
    const router = useRouter();

    return (
        <div className="flex flex-col gap-3">
            {isPetitionable(city.status) && (
                <Button
                    onClick={() => router.push(`/${city.id}/petition`)}
                    size="xl"
                    className="group transition-all duration-300"
                >
                    <div className="relative z-10 flex items-center gap-2">
                        <BadgeCheck className="w-5 h-5" />
                        <span className="font-medium">{t('petitionCta')}</span>
                    </div>
                    <motion.div
                        className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                        whileHover={{ boxShadow: "0 0 30px rgba(var(--orange), 0.5)" }}
                    />
                </Button>
            )}
        </div>
    );
}
