"use client";
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client'
import List from '@/components/List';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { PersonWithRelations } from '@/lib/db/people';
import { sortPeople } from '@/lib/sorting/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { City } from '@prisma/client';
import { getAdministrativeBodyTypesForPeople, filterPersonByAdminBodyTypes, getBodiesOfTypeFromPeople } from '@/lib/utils/administrativeBodies';
import { BadgePicker } from '@/components/ui/badge-picker';

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
    const tCommon = useTranslations('Common');
    const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);

    const parties = useMemo(() =>
        partiesWithPersons.map(({ people, ...party }) => party),
        [partiesWithPersons]
    );

    const orderedPersons = useMemo(() => {
        return sortPeople(allPeople, partiesWithPersons, city?.peopleOrdering);
    }, [allPeople, partiesWithPersons, city?.peopleOrdering]);

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForPeople(allPeople, tCommon),
        [allPeople, tCommon]
    );

    const defaultFilterValues = useMemo(() => {
        const hasCouncil = typeOptions.some(o => o.value === 'council');
        return hasCouncil ? ['council' as AdministrativeBodyType] : undefined;
    }, [typeOptions]);

    return (
        <List<PersonWithRelations, Record<string, never>, AdministrativeBodyType>
            items={orderedPersons}
            editable={canEdit}
            ItemComponent={PersonCard}
            FormComponent={PersonForm}
            formProps={{ cityId, parties, administrativeBodies }}
            t={t}
            filterAvailableValues={typeOptions}
            filter={(selectedValues, person) => {
                if (!filterPersonByAdminBodyTypes(person, selectedValues)) return false;
                if (selectedBodyId) {
                    return person.roles.some(r => r.administrativeBodyId === selectedBodyId);
                }
                return true;
            }}
            defaultFilterValues={defaultFilterValues}
            renderFilter={({ selectedValues, onChange }) => {
                if (typeOptions.length <= 1) return null;
                return (
                    <BadgePicker
                        options={typeOptions}
                        selectedValues={selectedValues}
                        onSelectionChange={(values) => {
                            setSelectedBodyId(null);
                            onChange(values);
                        }}
                        allLabel={tCommon('allPeople')}
                        collapsible={false}
                        inline
                    />
                );
            }}
            renderAfterFilters={(selectedValues) => {
                const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                if (!selectedType || selectedType === 'council') return null;
                const subBodies = getBodiesOfTypeFromPeople(allPeople, selectedType);
                if (subBodies.length <= 1) return null;
                return (
                    <BadgePicker
                        options={subBodies}
                        selectedValues={selectedBodyId ? [selectedBodyId] : []}
                        onSelectionChange={(values) => setSelectedBodyId(values.length > 0 ? values[0] : null)}
                        allLabel={tCommon('allBodies')}
                    />
                );
            }}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
        />
    );
}
