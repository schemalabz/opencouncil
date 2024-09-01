import { Person, Party } from '@prisma/client';
import { Link } from '../../i18n/routing';
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

interface PersonCardProps {
    item: Person & { party: Party | null };
    editable: boolean;
    parties: Party[];
}
export default function PersonCard({ item: person, editable, parties }: PersonCardProps) {
    const t = useTranslations('PersonCard');
    const locale = useLocale();
    let localizedRole = locale === 'el' ? person.role : person.role_en;

    return (
        <Card className="relative h-48 overflow-hidden transition-transform border-l-8" style={{
            borderLeftColor: person.party?.colorHex || 'gray'
        }}>
            <CardContent className="relative h-full flex flex-col justify-center">
                <div className="flex items-center space-x-4">
                    <PersonImage imageUrl={person.image} width={48} height={48} name={person.name} />
                    <div className="flex flex-col justify-center">
                        <h3 className="text-2xl font-bold">{person.name} {person.role ? <Badge>{localizedRole}</Badge> : ''}</h3>
                        {person.party && (
                            <p className="mt-2">
                                <PartyBadge party={person.party} shortName={false} />
                            </p>
                        )}
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}

interface PersonImageProps {
    imageUrl: string | null;
    width: number;
    height: number;
    name: string;
}

const PersonImage: React.FC<PersonImageProps> = ({ imageUrl, width, height, name }) => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();

    return (
        <div
            style={{
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: imageUrl ? 'transparent' : '#ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#fff',
            }}
        >
            {imageUrl ? (
                <Image
                    src={imageUrl}
                    alt="Person image"
                    width={width}
                    height={height}
                    className="object-contain"
                />
            ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {initials}
                </div>
            )}
        </div>
    );
};
