import { Person, Party } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import Image from 'next/image';
import { useState } from 'react';
import { Card, CardContent, CardFooter } from "../ui/card";
import FormSheet from '../FormSheet';
import PersonForm from './PersonForm';
import { useTranslations } from 'next-intl';
import React from 'react';
import PartyBadge from '../PartyBadge';
import { useLocale } from 'next-intl';
import { Badge } from '../ui/badge';
import { ImageOrInitials } from '../ImageOrInitials';

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

    return (
        <Card
            className="relative overflow-hidden transition-transform border-l-8 cursor-pointer hover:shadow-md"
            style={{
                borderLeftColor: person.party?.colorHex || 'gray'
            }}
            onClick={handleClick}
        >
            <CardContent className="relative flex items-center p-4">
                <div className="flex-shrink-0 mr-4">
                    <ImageOrInitials imageUrl={person.image} width={64} height={64} name={person.name} />
                </div>
                <div className="flex flex-col justify-center space-y-2">
                    <div className="flex items-center space-x-2">
                        <h3 className="text-2xl font-bold">{person.name}</h3>
                        {person.role ? <Badge>{localizedRole}</Badge> : ''}
                    </div>
                    <div>
                        {person.party && (
                            <PartyBadge party={person.party} shortName={false} />
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}