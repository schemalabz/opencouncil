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
import { PartyWithPersons } from '@/lib/db/parties';
import { filterActiveRoles } from '@/lib/utils';
import { useMemo } from 'react';

interface PartyCardProps {
    item: PartyWithPersons
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('Party');
    const router = useRouter();

    // Get active roles and sort them
    const activeRoles = useMemo(() => {
        const roles = filterActiveRoles(party.roles);
        return roles.sort((a, b) => {
            if (a.isHead && !b.isHead) return -1;
            if (!b.isHead && a.isHead) return 1;
            return a.person.name.localeCompare(b.person.name);
        });
    }, [party.roles]);

    // Transform roles into PersonWithRelations for PersonAvatarList
    const activePersons = useMemo(() =>
        activeRoles.map(role => ({
            ...role.person,
            party,
            roles: [role]
        }))
        , [activeRoles, party]);

    const handleClick = () => {
        router.push(`/${party.cityId}/parties/${party.id}`);
    };

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
                            users={activePersons}
                            maxDisplayed={5}
                            numMore={activePersons.length > 5 ? activePersons.length - 5 : 0}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
