"use client";
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { AdministrativeBodyType, Realm } from '@prisma/client';
import List from '@/components/List';
import MeetingCardV2 from '@/components/meetings/MeetingCardV2';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { AdminBodyPicker, type AdminBodyGroup } from '@/components/ui/admin-body-picker';
import { useServerCollection } from '@/components/collection/useServerCollection';
import { meetingsTabFilters } from '@/lib/meetingsTab';

type CityMeetingsProps = {
    /** The meetings on the current page. The server page loads one page at a time. */
    rows: CouncilMeetingWithSubjectPreview[],
    /** Every meeting that the filter and the search select, across all pages. */
    total: number,
    page: number,
    pageSize: number,
    cityId: string,
    /** The form offers the kind, the urgency and the session number in a Greek city only. */
    realm: Realm,
    timezone: string,
    canEdit: boolean,
    /** The bodies a body admin may create meetings for; absent for a city admin. */
    editableBodyIds?: string[],
    /**
     * Every body the city has released a meeting for — not only the bodies of
     * the listed rows. Deriving the picker from the rows hid any body whose
     * last meeting fell outside them: no chip, no empty state.
     */
    administrativeBodies: PublicAdministrativeBody[],
    /** Fixed by the server page, so a card's stage survives hydration. */
    now: Date,
};

export default function CityMeetings({
    rows,
    total,
    page,
    pageSize,
    cityId,
    realm,
    timezone,
    canEdit,
    editableBodyIds,
    administrativeBodies,
    now,
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');
    const tCommon = useTranslations('Common');

    const { filterOptions, defaultFilterValues, bodyOptionsFor } = useMemo(
        () => meetingsTabFilters(administrativeBodies, tCommon),
        [administrativeBodies, tCommon]
    );

    const state = useServerCollection<CouncilMeetingWithSubjectPreview, AdministrativeBodyType>({
        rows,
        total,
        page,
        pageSize,
        filterOptions,
        defaultFilterValues,
        unsetMeansEveryValue: false,
        bodyOptionsFor,
    });

    // Two-level picker groups. The council offers no instance picker (see meetingsTabFilters).
    const bodyGroups = useMemo<AdminBodyGroup[]>(() =>
        filterOptions.map(o => ({ type: o.value, typeLabel: o.label, bodies: bodyOptionsFor(o.value) })),
        [filterOptions, bodyOptionsFor]
    );

    return (
        <List<CouncilMeetingWithSubjectPreview, { cityTimezone: string; now: Date }, AdministrativeBodyType>
            state={state}
            editable={canEdit}
            ItemComponent={MeetingCardV2}
            itemProps={{ cityTimezone: timezone, now }}
            FormComponent={AddMeetingForm}
            formProps={{ cityId, realm, allowedBodyIds: editableBodyIds }}
            t={t}
            renderFilter={({ selectedValues, onChange }) => {
                const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                return (
                    <AdminBodyPicker
                        groups={bodyGroups}
                        selectedType={selectedType}
                        onTypeChange={(type) => onChange(type ? [type] : [])}
                        selectedBodyId={state.selectedBody}
                        onBodyChange={state.setBody}
                        allTypesLabel={tCommon('allMeetings')}
                        allBodiesLabel={tCommon('allBodies')}
                    />
                );
            }}
            showCount
            smColumns={1}
            mdColumns={2}
            // Two at the widest as well: the same card truncates at a third of this column.
            lgColumns={2}
        />
    );
}
