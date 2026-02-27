"use client";
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AdministrativeBodyType } from '@prisma/client';
import List from '@/components/List';
import MeetingCard from '@/components/meetings/MeetingCard';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getAdministrativeBodyTypesForMeetings, filterMeetingByAdminBodyTypes, getBodiesOfTypeFromMeetings } from '@/lib/utils/administrativeBodies';
import { PaginationParams } from '@/lib/db/types';
import { BadgePicker } from '@/components/ui/badge-picker';

type CityMeetingsProps = {
    councilMeetings: CouncilMeetingWithAdminBodyAndSubjects[],
    cityId: string,
    timezone: string,
    canEdit: boolean,
    pageRenderedAt: string,
} & Partial<PaginationParams>;

export default function CityMeetings({
    councilMeetings,
    cityId,
    timezone,
    canEdit,
    pageRenderedAt,
    currentPage,
    pageSize
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');
    const tCommon = useTranslations('Common');
    const [selectedBodyId, setSelectedBodyId] = useState<string | null>(null);

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForMeetings(councilMeetings, tCommon),
        [councilMeetings, tCommon]
    );

    const defaultFilterValues = useMemo(() => {
        const hasCouncil = typeOptions.some(o => o.value === 'council');
        return hasCouncil ? ['council' as AdministrativeBodyType] : undefined;
    }, [typeOptions]);

    return (
        <List<CouncilMeetingWithAdminBodyAndSubjects, { cityTimezone: string; referenceNow: string }, AdministrativeBodyType>
            items={councilMeetings}
            editable={canEdit}
            ItemComponent={MeetingCard}
            itemProps={{ cityTimezone: timezone, referenceNow: pageRenderedAt }}
            FormComponent={AddMeetingForm}
            formProps={{ cityId }}
            t={t}
            filterAvailableValues={typeOptions}
            filter={(selectedValues, meeting) => {
                if (!filterMeetingByAdminBodyTypes(meeting, selectedValues)) return false;
                if (selectedBodyId) {
                    return meeting.administrativeBody?.id === selectedBodyId;
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
                        allLabel={tCommon('allMeetings')}
                        collapsible={false}
                        inline
                    />
                );
            }}
            renderAfterFilters={(selectedValues) => {
                const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                if (!selectedType || selectedType === 'council') return null;
                const subBodies = getBodiesOfTypeFromMeetings(councilMeetings, selectedType);
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
            pagination={currentPage && pageSize ? { currentPage, pageSize } : undefined}
        />
    );
}
