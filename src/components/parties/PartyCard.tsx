'use client'
import { Party, Person } from '@prisma/client';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';

interface PartyCardProps {
    item: Party & { persons: Person[] };
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const [showAllMembers, setShowAllMembers] = useState(false);
    const t = useTranslations('PartyCard');
    const router = useRouter();
    const memberNames = party.persons.map(person => person.name);
    const displayedNames = showAllMembers ? memberNames : memberNames.slice(0, 3);
    const remainingCount = memberNames.length - displayedNames.length;

    const handleClick = () => {
        router.push(`/${party.cityId}/parties/${party.id}`);
    };

    return (
        <Card
            className="relative h-48 overflow-hidden transition-transform border-l-8 cursor-pointer hover:shadow-md"
            style={{ borderLeftColor: party.colorHex }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col justify-center">
                <div className="flex items-center space-x-4">
                    <ImageOrInitials imageUrl={party.logo} width={64} height={64} name={party.name_short} color={party.colorHex} />
                    <h3 className="text-2xl font-bold">{party.name}</h3>
                </div>
                <p className="mt-2">
                    {memberNames.length === 0 ? (
                        'No members'
                    ) : (
                        <>
                            {memberNames.length} members, including {displayedNames.join(', ')}
                            {remainingCount > 0 && (
                                <>
                                    , and <button onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAllMembers(!showAllMembers);
                                    }} className="text-blue-500 underline">
                                        {remainingCount} {showAllMembers ? 'less' : 'others'}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </p>
            </CardContent>
        </Card>
    );
}
