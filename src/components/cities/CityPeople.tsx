"use client";
import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AdministrativeBodyType } from '@prisma/client'
import type { PublicAdministrativeBody } from '@/lib/db/types'
import List from '@/components/List';
import { useLocalCollection } from '@/components/collection/useLocalCollection';
import { bodyOptionsForSelection } from '@/lib/utils/filterURL';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { PersonWithRelations } from '@/lib/db/people';
import { sortBodyMembers, sortPeople } from '@/lib/sorting/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { getAdministrativeBodyTypesForPeople, filterPersonByAdminBodyTypes, getBodiesOfTypeFromPeople } from '@/lib/utils/administrativeBodies';
import { BadgePicker } from '@/components/ui/badge-picker';
import { filterActiveRoles, getRoleText, isRoleActive } from '@/lib/utils/roles';
import { useRoleTitles } from '@/hooks/useRoleTitles';
import { getLocalizedName } from '@/lib/formatters/name';
import { AdminToolButton } from '@/components/admin/AdminStrip';
import ElectedOrderSheet from '@/components/admin/people/ElectedOrderSheet';
import { SecondaryTierToggle } from '@/components/cities/SecondaryTierToggle';
import { bodyTier, hasPrimaryPresence } from '@/lib/utils/bodyTier';

type CityPeopleProps = {
    allPeople: PersonWithRelations[],
    partiesWithPersons: PartyWithPersons[],
    administrativeBodies: PublicAdministrativeBody[],
    cityId: string,
    canEdit: boolean,
    /** Superadmin-only tools. `canEdit` is true for a city admin too, who must not get these. */
    isSuperAdmin: boolean,
    /**
     * The bodies a body admin may give roles on. Absent for a city admin, who
     * may give any role. The form then offers these bodies and no party.
     */
    editableBodyIds?: string[],
    /** Whether the page shows the people of the secondary tier (#829); see the people page. */
    showSecondary: boolean,
};

export default function CityPeople({
    allPeople,
    partiesWithPersons,
    administrativeBodies,
    cityId,
    canEdit,
    isSuperAdmin,
    editableBodyIds,
    showSecondary,
}: CityPeopleProps) {
    const t = useTranslations('Person');
    const tCommon = useTranslations('Common');
    const locale = useLocale();
    const roleTitles = useRoleTitles();

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
            getRoleText(role, roleTitles),
            role.party?.name,
            role.party?.name_en,
            role.party?.name_short,
            role.party?.name_short_en,
            role.administrativeBody?.name,
            role.administrativeBody?.name_en,
        ]),
    ], [locale, roleTitles]);

    const parties = useMemo(() =>
        partiesWithPersons.map(({ people, ...party }) => party),
        [partiesWithPersons]
    );

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForPeople(allPeople, tCommon),
        [allPeople, tCommon]
    );
    const secondaryAvailable = useMemo(() =>
        allPeople.some(person => !hasPrimaryPresence(person.roles)),
        [allPeople]
    );

    // The council carries no sub-bodies, so only a narrower type offers a body.
    const bodyOptionsFor = useCallback((type: AdministrativeBodyType) =>
        type === 'council' ? [] : getBodiesOfTypeFromPeople(allPeople, type),
        [allPeople]
    );

    // One body named: that body's order. One type: the bodies of that type in
    // turn. Otherwise the city order.
    const sortItems = useCallback((items: PersonWithRelations[], selectedValues: AdministrativeBodyType[], bodyId: string | null) => {
        if (bodyId) return sortBodyMembers(items, bodyId);
        return sortPeople(items, selectedValues.length === 1 ? selectedValues[0] : undefined);
    }, []);

    const state = useLocalCollection<PersonWithRelations, AdministrativeBodyType>(allPeople, {
        filterOptions: typeOptions,
        bodyOptionsFor,
        filter: (selectedValues, person, bodyId) => {
            // The roster of the municipality, unless the reader widened the
            // page or named a type of the secondary tier: a named type means
            // its whole roster, not the few who also hold a seat of the
            // municipality.
            const widened = showSecondary || selectedValues.some(type => bodyTier(type) === 'secondary');
            if (!widened && !hasPrimaryPresence(person.roles)) return false;
            if (!filterPersonByAdminBodyTypes(person, selectedValues)) return false;
            return bodyId ? person.roles.some(r => r.administrativeBodyId === bodyId) : true;
        },
        sortItems,
        // A quiet filter over the loaded rows. The identity band's field is
        // the page's search, and it searches transcripts instead.
        searchKeys,
    });

    // Kept apart from `open` so the sheet still has a body while it animates out.
    const [electedOrderBodyId, setElectedOrderBodyId] = useState<string | null>(null);
    const [electedOrderOpen, setElectedOrderOpen] = useState(false);
    const tElectedOrder = useTranslations('ElectedOrderSheet');

    // The one body on screen, or null. A body named in the URL wins. Otherwise
    // the type in view decides when it has a single body: the sub-body picker
    // hides itself for a single body, and the type picker hides itself when the
    // city has one type, so neither ever names it. Two bodies of the type is
    // ambiguous, and an order is one body's.
    const bodyOnScreen = useCallback((selectedValues: AdministrativeBodyType[]): string | null => {
        // The parsed view names a body only while one non-council type is selected.
        if (state.selectedBody) return state.selectedBody;
        const typeInView = selectedValues.length === 1 ? selectedValues[0]
            : selectedValues.length === 0 && typeOptions.length === 1 ? typeOptions[0].value
            : null;
        if (!typeInView) return null;
        const bodies = getBodiesOfTypeFromPeople(allPeople, typeInView);
        return bodies.length === 1 ? bodies[0].value : null;
    }, [state.selectedBody, typeOptions, allPeople]);

    const adminTools = useCallback((selectedValues: AdministrativeBodyType[]) => {
        if (!isSuperAdmin) return null;
        const bodyId = bodyOnScreen(selectedValues);
        if (!bodyId) return null;
        return (
            <AdminToolButton onClick={() => { setElectedOrderBodyId(bodyId); setElectedOrderOpen(true); }}>
                {tElectedOrder('title')}
            </AdminToolButton>
        );
    }, [isSuperAdmin, bodyOnScreen, tElectedOrder]);

    return (
        <>
        <List<PersonWithRelations, Record<string, never>, AdministrativeBodyType>
            state={state}
            editable={canEdit}
            adminTools={adminTools}
            ItemComponent={PersonCard}
            FormComponent={PersonForm}
            formProps={editableBodyIds
                ? { cityId, parties: [], administrativeBodies: administrativeBodies.filter(body => editableBodyIds.includes(body.id)), roleTypes: ['administrativeBody' as const] }
                : { cityId, parties, administrativeBodies }}
            t={t}
            renderFilter={({ selectedValues, onChange }) => {
                if (typeOptions.length <= 1 && !secondaryAvailable) return null;
                return (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {typeOptions.length > 1 && (
                            <BadgePicker
                                options={typeOptions}
                                selectedValues={selectedValues}
                                onSelectionChange={onChange}
                                allLabel={tCommon('allPeople')}
                                collapsible={false}
                                inline
                            />
                        )}
                        {secondaryAvailable && <SecondaryTierToggle shown={showSecondary} />}
                    </div>
                );
            }}
            renderAfterFilters={(selectedValues) => {
                const subBodies = bodyOptionsForSelection(selectedValues, bodyOptionsFor);
                if (subBodies.length <= 1) return null;
                return (
                    <BadgePicker
                        options={subBodies}
                        selectedValues={state.selectedBody ? [state.selectedBody] : []}
                        onSelectionChange={(values) => state.setBody(values.length > 0 ? values[0] : null)}
                        allLabel={tCommon('allBodies')}
                    />
                );
            }}
            // Whoever holds no role any more closes the list under their own
            // heading, instead of sitting between today's members by surname.
            trailing={{ title: t('formerMembers'), matches: person => !person.roles.some(isRoleActive) }}
            showCount
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
        />
        {electedOrderBodyId && (
            <ElectedOrderSheet
                open={electedOrderOpen}
                onOpenChange={setElectedOrderOpen}
                people={allPeople}
                cityId={cityId}
                administrativeBodyId={electedOrderBodyId}
            />
        )}
        </>
    );
}
