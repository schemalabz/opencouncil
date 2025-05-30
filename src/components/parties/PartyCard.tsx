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
                "border-l-8"
            )}
            style={{ borderLeftColor: party.colorHex }}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4 flex-grow">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-16 h-16 sm:w-20 sm:h-20">
                            <ImageOrInitials
                                imageUrl={party.logo}
                                width={80}
                                height={80}
                                name={party.name_short}
                                color={party.colorHex}
                                square={true}
                            />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold line-clamp-2">{party.name}</h3>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                        <PersonAvatarList
                            users={activePersonsForAvatarList}
                            maxDisplayed={5}
                            numMore={activePersonsForAvatarList.length > 5 ? activePersonsForAvatarList.length - 5 : 0}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
