"use client";
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AdministrativeBody } from '@prisma/client'
import List from '@/components/List';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { PersonWithRelations } from '@/lib/db/people';
import { sortPersonsByLastName } from '@/components/utils';
import { PartyWithPersons } from '@/lib/db/parties';

type CityPeopleProps = {
    partiesWithPersons: PartyWithPersons[],
    administrativeBodies: AdministrativeBody[],
    cityId: string,
    canEdit: boolean
};

export default function CityPeople({ 
    partiesWithPersons,
    administrativeBodies,
    cityId, 
    canEdit 
}: CityPeopleProps) {
    const t = useTranslations('Person');

    // Extract all persons and parties from partiesWithPersons
    const { persons, parties } = useMemo(() => {
        // Extract all persons from all parties
        const allPersons = partiesWithPersons.flatMap(party => 
            party.people as PersonWithRelations[]
        );
        
        // Extract just the party data without the people property
        const partiesData = partiesWithPersons.map(({ people, ...party }) => party);
        
        return {
            persons: allPersons,
            parties: partiesData
        };
    }, [partiesWithPersons]);

    const orderedPersons = sortPersonsByLastName(persons);

    const peopleAdministrativeBodies = [
        ...Array.from(new Map(
            persons
                .flatMap(person => person.roles
                    .filter(role => role.administrativeBody)
                    .map(role => [
                        role.administrativeBody!.id,
                        {
                            value: role.administrativeBody!.id,
                            label: role.administrativeBody!.name
                        }
                    ])
                )
        ).values()),
        ...(persons.some(person => person.roles.some(role => !role.administrativeBody)) ? [{
            value: null,
            label: "Χωρίς διοικητικό όργανο"
        }] : [])
    ];

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
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
        />
    );
} 