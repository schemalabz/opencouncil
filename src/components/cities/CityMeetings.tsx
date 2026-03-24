"use client";
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdministrativeBodyType } from '@prisma/client';
import List from '@/components/List';
import MeetingCard from '@/components/meetings/MeetingCard';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getAdministrativeBodyTypesForMeetings, filterMeetingByAdminBodyTypes, getBodiesOfTypeFromMeetings } from '@/lib/utils/administrativeBodies';
import { PaginationParams } from '@/lib/db/types';
import { BadgePicker } from '@/components/ui/badge-picker';
import { updateBodyFilterURL, resolveBodyFromURL } from '@/lib/utils/filterURL';

type CityMeetingsProps = {
    councilMeetings: CouncilMeetingWithAdminBodyAndSubjects[],
    cityId: string,
    timezone: string,
    canEdit: boolean,
} & Partial<PaginationParams>;

export default function CityMeetings({
    councilMeetings,
    cityId,
    timezone,
    canEdit,
    currentPage,
    pageSize
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');
    const tCommon = useTranslations('Common');
    const searchParams = useSearchParams();

    const typeOptions = useMemo(() =>
        getAdministrativeBodyTypesForMeetings(councilMeetings, tCommon),
        [councilMeetings, tCommon]
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
            const subBodies = getBodiesOfTypeFromMeetings(councilMeetings, option.value);
            const match = subBodies.find(o => o.label === bodyLabel);
            if (match) return match.value;
        }
        return null;
    }, [searchParams, councilMeetings, typeOptions]);

    return (
        <List<CouncilMeetingWithAdminBodyAndSubjects, { cityTimezone: string }, AdministrativeBodyType>
            items={councilMeetings}
            editable={canEdit}
            ItemComponent={MeetingCard}
            itemProps={{ cityTimezone: timezone }}
            FormComponent={AddMeetingForm}
            formProps={{ cityId }}
            t={t}
            filterAvailableValues={typeOptions}
            filter={(selectedValues, meeting) => {
                if (!filterMeetingByAdminBodyTypes(meeting, selectedValues)) return false;
                if (resolvedBodyId) {
                    const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                    if (selectedType && selectedType !== 'council') {
                        return meeting.administrativeBody?.id === resolvedBodyId;
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
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            pagination={currentPage && pageSize ? { currentPage, pageSize } : undefined}
        />
    );
}
