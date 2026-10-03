"use client";
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { AdministrativeBodyType, Realm } from '@prisma/client';
import List from '@/components/List';
import MeetingCardV2 from '@/components/meetings/MeetingCardV2';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import { getAdministrativeBodyTypes, filterMeetingByAdminBodyTypes, getBodiesOfType } from '@/lib/utils/administrativeBodies';
import type { PaginationParams, PublicAdministrativeBody } from '@/lib/db/types';
import { AdminBodyPicker, type AdminBodyGroup } from '@/components/ui/admin-body-picker';
import { useLocalCollection } from '@/components/collection/useLocalCollection';
import { meetingLabel } from '@/lib/meetingName';

type CityMeetingsProps = {
    councilMeetings: CouncilMeetingWithSubjectPreview[],
    cityId: string,
    /** The form offers the kind, the urgency and the session number in a Greek city only. */
    realm: Realm,
    timezone: string,
    canEdit: boolean,
    /** The bodies a body admin may create meetings for; absent for a city admin. */
    editableBodyIds?: string[],
    /**
     * Every body the city has released a meeting for — not only the bodies
     * inside the loaded window. The list is capped, so deriving the picker from
     * the rows hid any body whose last meeting fell outside it: no chip, no
     * empty state, and its meetings unreachable through the filter.
     */
    administrativeBodies: PublicAdministrativeBody[],
    /** Fixed by the server page, so a card's stage survives hydration. */
    now: Date,
    /** The row cap the page fetched with, so the count can name its window. */
    cappedAt?: number,
} & Pick<PaginationParams, 'pageSize'>;

export default function CityMeetings({
    councilMeetings,
    cityId,
    realm,
    timezone,
    canEdit,
    editableBodyIds,
    administrativeBodies,
    now,
    cappedAt,
    pageSize
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');
    const tCommon = useTranslations('Common');
    const locale = useLocale();

    // The subject titles are already on the card's preview, and they are what a
    // reader remembers a meeting by far more often than its number.
    const searchKeys = useCallback((meeting: CouncilMeetingWithSubjectPreview) => [
        meetingLabel(meeting, 'el', timezone),
        meetingLabel(meeting, 'en', timezone),
        meetingLabel(meeting, locale, timezone),
        meeting.administrativeBody?.name,
        meeting.administrativeBody?.name_en,
        ...meeting.subjects.map(subject => subject.name),
    ], [locale, timezone]);

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypes(administrativeBodies, tCommon),
        [administrativeBodies, tCommon]
    );

    // Council stays a single body in practice, so it offers no body picker
    // (legacy behavior).
    const bodyOptionsFor = useCallback((type: AdministrativeBodyType) =>
        type === 'council' ? [] : getBodiesOfType(administrativeBodies, type),
        [administrativeBodies]
    );

    // Two-level picker groups.
    const bodyGroups = useMemo<AdminBodyGroup[]>(() =>
        typeOptions.map(o => ({
            type: o.value,
            typeLabel: o.label,
            bodies: bodyOptionsFor(o.value),
        })),
        [typeOptions, bodyOptionsFor]
    );

    const defaultFilterValues = useMemo(() => {
        const hasCouncil = typeOptions.some(o => o.value === 'council');
        return hasCouncil ? ['council' as AdministrativeBodyType] : undefined;
    }, [typeOptions]);

    const state = useLocalCollection<CouncilMeetingWithSubjectPreview, AdministrativeBodyType>(councilMeetings, {
        filterOptions: typeOptions,
        defaultFilterValues,
        unsetMeansEveryValue: false,
        bodyOptionsFor,
        filter: (selectedValues, meeting, bodyId) => {
            if (!filterMeetingByAdminBodyTypes(meeting, selectedValues)) return false;
            return bodyId ? meeting.administrativeBody?.id === bodyId : true;
        },
        // A quiet filter over the loaded rows. The identity band's field is
        // the page's search, and it searches transcripts instead.
        searchKeys,
        pageSize,
        cappedAt,
    });

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
