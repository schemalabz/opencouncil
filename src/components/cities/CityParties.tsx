"use client";
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';

type CityPartiesProps = {
    partiesWithPersons: PartyWithPersons[],
    cityId: string,
    canEdit: boolean
};

export default function CityParties({ 
    partiesWithPersons, 
    cityId, 
    canEdit 
}: CityPartiesProps) {
    const t = useTranslations('Party');

    // Sort parties by member count, heads, and alphabetically
    const orderedParties = useMemo(() => {
        return [...partiesWithPersons]
            .sort((a, b) => {
                // Sort by member count first
                const memberCountDiff = b.people.length - a.people.length;
                if (memberCountDiff !== 0) return memberCountDiff;

                // If same member count, sort by party head
                const aHasHead = a.people.some(person =>
                    person.roles.some(role => role.partyId === a.id && role.isHead)
                );
                const bHasHead = b.people.some(person =>
                    person.roles.some(role => role.partyId === b.id && role.isHead)
                );
                if (aHasHead && !bHasHead) return -1;
                if (!aHasHead && bHasHead) return 1;

                // If still tied, sort alphabetically
                return a.name.localeCompare(b.name);
            });
    }, [partiesWithPersons]);

    return (
        <List
            items={orderedParties}
            editable={canEdit}
            ItemComponent={PartyCard}
            FormComponent={PartyForm}
            formProps={{ cityId }}
            t={t}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
        />
    );
} 