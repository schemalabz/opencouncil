"use client";
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AdministrativeBody } from '@prisma/client'
import List from '@/components/List';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { PersonWithRelations } from '@/lib/db/people';
import { sortPeople } from '@/lib/sorting/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { City } from '@prisma/client';

type CityPeopleProps = {
    allPeople: PersonWithRelations[],
    partiesWithPersons: PartyWithPersons[],
    administrativeBodies: AdministrativeBody[],
    cityId: string,
    canEdit: boolean,
    city: City | null
};

export default function CityPeople({
    allPeople,
    partiesWithPersons,
    administrativeBodies,
    cityId, 
    canEdit,
    city
}: CityPeopleProps) {
    const t = useTranslations('Person');

    // Extract just the party data without the people property
    const parties = useMemo(() => 
        partiesWithPersons.map(({ people, ...party }) => party),
        [partiesWithPersons]
    );

    const orderedPersons = useMemo(() => {
        return sortPeople(allPeople, partiesWithPersons, city?.peopleOrdering);
    }, [allPeople, partiesWithPersons, city?.peopleOrdering]);

    const peopleAdministrativeBodies = useMemo(() => {
        // Extract unique administrative bodies
        const adminBodiesMap = new Map(
            allPeople
                .flatMap(person => person.roles
                    .filter(role => role.administrativeBody)
                    .map(role => [
                        role.administrativeBody!.id,
                        {
                            value: role.administrativeBody!.id,
                            label: role.administrativeBody!.name,
                            type: role.administrativeBody!.type
                        }
                    ])
                )
        );

        // Sort: council first, committees second, communities alphabetically, then Άλλοι
        const sortedBodies = Array.from(adminBodiesMap.values()).sort((a, b) => {
            // Council first
            if (a.type === 'council' && b.type !== 'council') return -1;
            if (a.type !== 'council' && b.type === 'council') return 1;

            // Committees second
            if (a.type === 'committee' && b.type === 'community') return -1;
            if (a.type === 'community' && b.type === 'committee') return 1;

            // Within same type, sort alphabetically by label
            return a.label.localeCompare(b.label, 'el');
        });

        // Check if any person has no administrative body role
        const hasNoAdminBody = allPeople.some(person =>
            person.roles.some(role => !role.administrativeBody)
        );

        return [
            ...sortedBodies.map(({ value, label }) => ({ value, label })),
            ...(hasNoAdminBody ? [{
                value: null,
                label: "Άλλοι"
            }] : [])
        ];
    }, [allPeople]);

    // Find "Δημοτικό Συμβούλιο" and "Άλλοι" for default filters
    const defaultCouncilBody = peopleAdministrativeBodies.find(
        body => body.label === "Δημοτικό Συμβούλιο"
    );
    const othersBody = peopleAdministrativeBodies.find(
        body => body.label === "Άλλοι"
    );

    // Build default filter values (Δημοτικό Συμβούλιο + Άλλοι)
    const defaultFilterValues = useMemo(() => {
        const defaults: (string | null)[] = [];
        if (defaultCouncilBody) defaults.push(defaultCouncilBody.value);
        if (othersBody) defaults.push(othersBody.value);
        return defaults.length > 0 ? defaults : undefined;
    }, [defaultCouncilBody, othersBody]);

    return (
        <List
            items={orderedPersons}
            editable={canEdit}
            ItemComponent={PersonCard}
            FormComponent={PersonForm}
            formProps={{ cityId, parties, administrativeBodies }}
            t={t}
            filterAvailableValues={peopleAdministrativeBodies}
            filter={(selectedValues, person) =>
                selectedValues.length === 0 ||
                (selectedValues.includes(null) && !person.roles.some(role => role.administrativeBody)) ||
                person.roles.some(role =>
                    role.administrativeBody && selectedValues.includes(role.administrativeBody.id)
                )
            }
            defaultFilterValues={defaultFilterValues}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
        />
    );
} 