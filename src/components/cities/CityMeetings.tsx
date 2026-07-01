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
import { AdminBodyPicker, type AdminBodyGroup } from '@/components/ui/admin-body-picker';
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

    // Two-level picker groups. Council stays a single body in practice, so keep its
    // instance picker hidden (legacy behavior) by giving it no bodies.
    const bodyGroups = useMemo<AdminBodyGroup[]>(() =>
        typeOptions.map(o => ({
            type: o.value,
            typeLabel: o.label,
            bodies: o.value === 'council' ? [] : getBodiesOfTypeFromMeetings(councilMeetings, o.value),
        })),
        [typeOptions, councilMeetings]
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
                const selectedType = selectedValues.length === 1 ? selectedValues[0] : null;
                const subBodies = selectedType
                    ? (bodyGroups.find(g => g.type === selectedType)?.bodies ?? [])
                    : [];
                return (
                    <AdminBodyPicker
                        groups={bodyGroups}
                        selectedType={selectedType}
                        onTypeChange={(type) => onChange(type ? [type] : [])}
                        selectedBodyId={resolveBodyFromURL(searchParams, subBodies)}
                        onBodyChange={(bodyId) => updateBodyFilterURL(bodyId, subBodies, searchParams)}
                        allTypesLabel={tCommon('allMeetings')}
                        allBodiesLabel={tCommon('allBodies')}
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
