'use client'
import { useRouter } from '@/i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';
import { PersonAvatarList } from '../persons/PersonAvatarList';
import { cn, isRoleActive } from '@/lib/utils';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';
import { sortPartyMembers } from '@/lib/sorting/people';

interface PartyCardProps {
    item: PartyWithPersons
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('Party');
    const router = useRouter();

    // Get active people with party roles, sorted with council members first
    const activePeople = useMemo(() => {
        const filtered = party.people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                isRoleActive(role)
            )
        );
        return sortPartyMembers(filtered, party.id, true);
    }, [party.people, party.id]);

    // Count members by administrative body type
    const memberCountsByType = useMemo(() => {
        const counts = {
            council: 0,
            committee: 0,
            community: 0
        };

        activePeople.forEach(person => {
            const adminBodyTypes = new Set(
                person.roles
                    .filter(role => role.administrativeBody)
                    .map(role => role.administrativeBody!.type)
            );

            // Count each person only once per type
            if (adminBodyTypes.has('council')) counts.council++;
            if (adminBodyTypes.has('committee')) counts.committee++;
            if (adminBodyTypes.has('community')) counts.community++;
        });

        return counts;
    }, [activePeople]);

    // Build member breakdown text
    const memberBreakdownText = useMemo(() => {
        const breakdownParts: string[] = [];

        if (memberCountsByType.council > 0) {
            breakdownParts.push(`${memberCountsByType.council} στο Δημοτικό Συμβούλιο`);
        }
        if (memberCountsByType.committee > 0) {
            breakdownParts.push(`${memberCountsByType.committee} σε επιτροπές`);
        }
        if (memberCountsByType.community > 0) {
            breakdownParts.push(`${memberCountsByType.community} σε κοινότητες`);
        }

        const mayorCount = activePeople.filter(person =>
            person.roles.some(role =>
                role.cityId &&
                !role.partyId &&
                !role.administrativeBodyId &&
                role.isHead
            )
        ).length;

        const peopleWithoutAdminCount = activePeople.filter(person =>
            !person.roles.some(role => role.administrativeBodyId)
        ).length;

        const othersCount = Math.max(0, peopleWithoutAdminCount - mayorCount);

        if (othersCount > 0) {
            breakdownParts.push(`${othersCount} άλλοι`);
        }

        if (breakdownParts.length === 0) {
            return mayorCount > 0 ? 'Δήμαρχος' : '';
        }

        if (mayorCount > 0) {
            return `Δήμαρχος, ${breakdownParts.join(', ')}`;
        }

        return breakdownParts.join(', ');
    }, [activePeople, memberCountsByType]);

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
                "group relative overflow-hidden transition-all duration-300 cursor-pointer h-full",
                "hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5"
            )}
            onClick={handleClick}
        >
            <CardContent className="p-4 sm:p-5 h-full flex flex-col relative">
                {/* Colored left bar */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] sm:w-1"
                    style={{
                        backgroundColor: party.colorHex,
                        borderTopLeftRadius: 'calc(0.5rem - 1.5px)',
                        borderBottomLeftRadius: 'calc(0.5rem - 1.5px)'
                    }}
                />
                <div className="flex-1 space-y-4 pl-3 sm:pl-4">
                    {/* Header with logo and title - properly aligned */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0">
                            <ImageOrInitials
                                imageUrl={party.logo}
                                width={56}
                                height={56}
                                name={party.name_short}
                                color={party.colorHex}
                                square={true}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm sm:text-base font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                                {party.name}
                            </h3>
                        </div>
                    </div>

                    {/* Members avatars */}
                    {activePersonsForAvatarList.length > 0 && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <PersonAvatarList
                                users={activePersonsForAvatarList}
                                maxDisplayed={3}
                                numMore={activePersonsForAvatarList.length > 3 ? activePersonsForAvatarList.length - 3 : 0}
                            />
                        </div>
                    )}
                </div>

                {/* Footer with member breakdown by administrative body */}
                <div className="pt-3 border-t border-border/50 mt-4 pl-3 sm:pl-4">
                    <div className="text-xs text-muted-foreground font-medium">
                        {memberBreakdownText}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
