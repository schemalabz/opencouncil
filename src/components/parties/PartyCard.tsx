'use client'
import { useRouter } from '@/i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';
import { PersonAvatarList } from '../persons/PersonAvatarList';
import { cn } from '@/lib/utils';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';

interface PartyCardProps {
    item: PartyWithPersons
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('Party');
    const router = useRouter();

    // Get active people with party roles
    const activePeople = useMemo(() => {
        return party.people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                (!role.endDate || new Date(role.endDate) > new Date())
            )
        ).sort((a, b) => {
            // Sort by isHead first (true comes before false)
            const aIsHead = a.roles.some(role => role.partyId === party.id && role.isHead);
            const bIsHead = b.roles.some(role => role.partyId === party.id && role.isHead);
            if (aIsHead && !bIsHead) return -1;
            if (!aIsHead && bIsHead) return 1;
            // Then sort by name
            return a.name.localeCompare(b.name);
        });
    }, [party.people, party.id]);

    // Transform people into PersonWithRelations for PersonAvatarList
    const activePersonsForAvatarList = useMemo(() =>
        activePeople.map(person => ({
            ...person,
            party,
            roles: person.roles.filter(role => role.partyId === party.id)
        }))
        , [activePeople, party]);

    const handleClick = () => {
        router.push(`/${party.cityId}/parties/${party.id}`);
    };

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:scale-[1.01] cursor-pointer",
                "border-l-4 sm:border-l-8"
            )}
            style={{ borderLeftColor: party.colorHex }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col p-3 sm:p-4 md:p-6">
                <div className="space-y-2 sm:space-y-3 md:space-y-4 flex-grow">
                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 flex-shrink-0">
                            <ImageOrInitials
                                imageUrl={party.logo}
                                width={80}
                                height={80}
                                name={party.name_short}
                                color={party.colorHex}
                                square={true}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg md:text-xl font-bold line-clamp-2 leading-tight">
                                {party.name}
                            </h3>
                        </div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={activePersonsForAvatarList}
                            maxDisplayed={4}
                            numMore={activePersonsForAvatarList.length > 4 ? activePersonsForAvatarList.length - 4 : 0}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
