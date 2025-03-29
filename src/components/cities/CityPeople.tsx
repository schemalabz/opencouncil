"use client";
import { Party } from '@prisma/client';
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { PersonWithRelations } from '@/lib/db/people';
import { sortPersonsByLastName } from '@/components/utils';

type CityPeopleProps = {
    persons: PersonWithRelations[],
    parties: Party[],
    cityId: string,
    canEdit: boolean
};

export default function CityPeople({ 
    persons, 
    parties, 
    cityId, 
    canEdit 
}: CityPeopleProps) {
    const t = useTranslations('Person');

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
            formProps={{ cityId, parties }}
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