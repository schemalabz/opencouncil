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
import { getAdministrativeBodiesForPeople, getDefaultAdministrativeBodyFilters, filterPersonByAdministrativeBodies } from '@/lib/utils/administrativeBodies';

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

    const peopleAdministrativeBodies = useMemo(() =>
        getAdministrativeBodiesForPeople(allPeople),
        [allPeople]
    );

    const defaultFilterValues = useMemo(() =>
        getDefaultAdministrativeBodyFilters(peopleAdministrativeBodies),
        [peopleAdministrativeBodies]
    );

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
                filterPersonByAdministrativeBodies(person, selectedValues)
            }
            defaultFilterValues={defaultFilterValues}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
        />
    );
} 