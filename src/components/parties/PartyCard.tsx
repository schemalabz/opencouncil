'use client'
import { useRouter } from '@/i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { ImageOrInitials } from '../ImageOrInitials';
import { PersonAvatarList } from '../persons/PersonAvatarList';
import { cn } from '@/lib/utils';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';
import { partyComposition } from '@/lib/party/composition';

interface PartyCardProps {
    item: PartyWithPersons
    editable: boolean;
}

export default function PartyCard({ item: party, editable }: PartyCardProps) {
    const t = useTranslations('Party');
    const router = useRouter();

    const composition = useMemo(() => partyComposition(party), [party]);
    const activePeople = composition.members;

    // Build member breakdown by administrative body
    const memberBreakdownText = useMemo(() => {
        const breakdownParts: string[] = [];

        if (composition.council > 0) {
            breakdownParts.push(t('breakdownCouncil', { count: composition.council }));
        }
        if (composition.committee > 0) {
            breakdownParts.push(t('breakdownCommittees', { count: composition.committee }));
        }
        if (composition.community > 0) {
            breakdownParts.push(t('breakdownCommunities', { count: composition.community }));
        }
        if (composition.unassigned > 0) {
            breakdownParts.push(t('breakdownOthers', { count: composition.unassigned }));
        }

        if (breakdownParts.length === 0) {
            return composition.hasMayor ? t('breakdownMayor') : '';
        }

        if (composition.hasMayor) {
            return `${t('breakdownMayor')}, ${breakdownParts.join(', ')}`;
        }

        return breakdownParts.join(', ');
    }, [composition, t]);

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
