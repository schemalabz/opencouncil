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

    const peopleAdministrativeBodies = [
        ...Array.from(new Map(
            allPeople
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
        ...(allPeople.some(person => person.roles.some(role => !role.administrativeBody)) ? [{
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