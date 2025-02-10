'use client'
import { Party, Person } from '@prisma/client';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';
import { PersonAvatarList } from '../persons/PersonAvatarList';
import { cn } from '@/lib/utils';
import { getPeopleForCity } from '@/lib/db/people';
import { useCouncilMeetingData } from '../meetings/CouncilMeetingDataContext';

interface PartyCardProps {
    item: Party
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('PartyCard');
    const { getPersonsForParty } = useCouncilMeetingData();
    const router = useRouter();

    const handleClick = () => {
        router.push(`/${party.cityId}/parties/${party.id}`);
    };

    // Add party info to each person
    const personsWithParty = getPersonsForParty(party.id);

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:scale-[1.01] cursor-pointer",
                "border-l-8"
            )}
            style={{ borderLeftColor: party.colorHex }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4 flex-grow">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-16 sm:h-16">
                            <ImageOrInitials
                                imageUrl={party.logo}
                                width={48}
                                height={48}
                                name={party.name_short}
                                color={party.colorHex}
                                square={true}
                            />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold line-clamp-2">{party.name}</h3>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={personsWithParty}
                            maxDisplayed={5}
                            numMore={personsWithParty.length > 5 ? personsWithParty.length - 5 : 0}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
