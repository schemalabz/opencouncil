'use client'
import { Person, Party } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent, CardFooter } from "../ui/card";
import { useTranslations } from 'next-intl';
import React from 'react';
import { useLocale } from 'next-intl';
import { format } from 'date-fns';
import { PersonBadge } from './PersonBadge';
import { cn } from '@/lib/utils';

interface PersonCardProps {
    item: Person & { party: Party | null };
    editable: boolean;
    parties: Party[];
}

export default function PersonCard({ item: person, editable, parties }: PersonCardProps) {
    const t = useTranslations('PersonCard');
    const locale = useLocale();
    const router = useRouter();
    let localizedRole = locale === 'el' ? person.role : person.role_en;

    const handleClick = () => {
        router.push(`/${person.cityId}/people/${person.id}`);
    };

    const formatActiveDates = (from: Date | null, to: Date | null) => {
        if (!to && !from) return null;
        if (to && !from) return `${t('activeUntil')} ${formatDate(to)}`;
        if (from && to) return `${t('active')}: ${formatDate(from)} - ${formatDate(to)}`;
        return null;
    };

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:scale-[1.01] cursor-pointer",
                "border-l-8"
            )}
            style={{
                borderLeftColor: person.party?.colorHex || 'gray'
            }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col justify-between p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4">
                    <PersonBadge
                        person={{ ...person, party: person.party }}
                        className="!text-base sm:!text-lg"
                    />
                    {formatActiveDates(person.activeFrom, person.activeTo) && (
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            {formatActiveDates(person.activeFrom, person.activeTo)}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

const formatDate = (date: Date | null) => {
    return date ? format(date, 'dd/MM/yyyy') : '-';
};
