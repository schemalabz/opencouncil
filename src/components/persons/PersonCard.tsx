'use client'
import { Person, Party } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent, CardFooter } from "../ui/card";
import { useTranslations } from 'next-intl';
import React from 'react';
import { useLocale } from 'next-intl';
import { format } from 'date-fns';
import { PersonBadge } from './PersonBadge';

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
            className="relative overflow-hidden transition-transform border-l-8 cursor-pointer hover:shadow-md"
            style={{
                borderLeftColor: person.party?.colorHex || 'gray'
            }}
            onClick={handleClick}
        >
            <CardContent className="relative flex items-center p-4">
                <PersonBadge
                    person={{ ...person, party: person.party }}
                />
                {formatActiveDates(person.activeFrom, person.activeTo) && (
                    <p className="text-xs text-gray-500">
                        {formatActiveDates(person.activeFrom, person.activeTo)}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

const formatDate = (date: Date | null) => {
    return date ? format(date, 'dd/MM/yyyy') : '-';
};
