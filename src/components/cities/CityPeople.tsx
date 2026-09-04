"use client";
import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
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
import { updateBodyFilterURL, resolveBodyFromURL } from '@/lib/utils/filterURL';
import { filterActiveRoles, getRoleText, isRoleActive } from '@/lib/utils/roles';
import { getLocalizedName } from '@/lib/formatters/name';

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
    const locale = useLocale();
    const searchParams = useSearchParams();

    // Both name columns, not just the localized one: a reader on the Greek page
    // may well type a councillor's name in Latin script. `getRoleText` adds the
    // label the card itself shows, which is where an untitled mayor's
    // "Δήμαρχος" comes from — the role row stores no name for it.
    const searchKeys = useCallback((person: PersonWithRelations) => [
        person.name,
        person.name_en,
        person.name_short,
        person.name_short_en,
        getLocalizedName(person, locale),
        ...filterActiveRoles(person.roles).flatMap(role => [
            role.name,
            role.name_en,
            getRoleText(role, t),
            role.party?.name,
            role.party?.name_en,
            role.party?.name_short,
            role.party?.name_short_en,
            role.administrativeBody?.name,
            role.administrativeBody?.name_en,
        ]),
    ], [locale, t]);

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

    // Pre-resolve body ID from URL once, instead of per-item in the filter callback
    const resolvedBodyId = useMemo(() => {
        const bodyLabel = searchParams.get('body');
        if (!bodyLabel) return null;
        for (const option of typeOptions) {
            if (option.value === 'council') continue;
            const subBodies = getBodiesOfTypeFromPeople(allPeople, option.value);
            const match = subBodies.find(o => o.label === bodyLabel);
            if (match) return match.value;
        }
        return null;
    }, [searchParams, allPeople, typeOptions]);

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
                if (resolvedBodyId) {
                    const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                    if (selectedType && selectedType !== 'council') {
                        return person.roles.some(r => r.administrativeBodyId === resolvedBodyId);
                    }
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
                        onSelectionChange={onChange}
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
                const selectedBodyId = resolveBodyFromURL(searchParams, subBodies);
                return (
                    <BadgePicker
                        options={subBodies}
                        selectedValues={selectedBodyId ? [selectedBodyId] : []}
                        onSelectionChange={(values) => updateBodyFilterURL(values.length > 0 ? values[0] : null, subBodies, searchParams)}
                        allLabel={tCommon('allBodies')}
                    />
                );
            }}
            // Whoever holds no role any more closes the list under their own
            // heading, instead of sitting between today's members by surname.
            trailing={{ title: t('formerMembers'), matches: person => !person.roles.some(isRoleActive) }}
            // A quiet filter over the loaded rows. The identity band's field is
            // the page's search, and it searches transcripts instead.
            searchKeys={searchKeys}
            showCount
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
        />
    );
}
