"use client";
import { Party } from '@prisma/client';
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import PartyCard from '@/components/parties/PartyCard';
import PartyForm from '@/components/parties/PartyForm';
import { PersonWithRelations } from '@/lib/db/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { useMemo } from 'react';

type CityPartiesProps = {
    parties: Party[],
    persons: PersonWithRelations[],
    cityId: string,
    canEdit: boolean
};

export default function CityParties({ 
    parties, 
    persons, 
    cityId, 
    canEdit 
}: CityPartiesProps) {
    const t = useTranslations('Party');

    // Create a map of parties with their people
    const partiesWithPeople = useMemo(() => {
        const partyMap = new Map<string, any>();

        // Initialize parties
        parties.forEach(party => {
            partyMap.set(party.id, {
                ...party,
                people: []
            });
        });

        // Add people to their parties
        persons.forEach(person => {
            if (person.roles) {
                person.roles.forEach(role => {
                    if (role.partyId && partyMap.has(role.partyId)) {
                        const party = partyMap.get(role.partyId);

                        // Check if person is already in the party's people array
                        const existingPersonIndex = party.people.findIndex((p: any) => p.id === person.id);

                        if (existingPersonIndex === -1) {
                            // Add person if not already in the array
                            party.people.push({
                                ...person,
                                roles: person.roles.map(r => ({
                                    ...r,
                                    party: r.partyId ? partyMap.get(r.partyId) : null
                                }))
                            });
                        }
                    }
                });
            }
        });

        return Array.from(partyMap.values()) as PartyWithPersons[];
    }, [parties, persons]);

    const orderedParties = [...partiesWithPeople]
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