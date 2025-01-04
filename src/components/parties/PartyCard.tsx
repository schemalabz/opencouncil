'use client'
import { Party, Person } from '@prisma/client';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';
import { PersonAvatarList } from '../persons/PersonAvatarList';

interface PartyCardProps {
    item: Party & { persons: Person[] };
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('PartyCard');
    const router = useRouter();

    const handleClick = () => {
        router.push(`/${party.cityId}/parties/${party.id}`);
    };

    // Add party info to each person
    const personsWithParty = party.persons.map(person => ({
        ...person,
        party
    }));

    return (
        <Card
            className="relative h-48 overflow-hidden transition-transform border-l-8 cursor-pointer hover:shadow-md"
            style={{ borderLeftColor: party.colorHex }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col justify-between">
                <div className="flex items-center space-x-4">
                    <ImageOrInitials imageUrl={party.logo} width={64} height={64} name={party.name_short} color={party.colorHex} />
                    <h3 className="text-2xl font-bold">{party.name}</h3>
                </div>

                <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <PersonAvatarList
                        users={personsWithParty}
                        maxDisplayed={5}
                        numMore={party.persons.length > 5 ? party.persons.length - 5 : 0}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
