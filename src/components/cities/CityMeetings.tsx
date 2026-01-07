"use client";
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import MeetingCard from '@/components/meetings/MeetingCard';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getDefaultAdministrativeBodyFilters, getAdministrativeBodiesForMeetings } from '@/lib/utils/administrativeBodies';

type CityMeetingsProps = {
    councilMeetings: CouncilMeetingWithAdminBodyAndSubjects[],
    cityId: string,
    timezone: string,
    canEdit: boolean,
    currentPage?: number,
    totalPages?: number,
    pageSize?: number
};

export default function CityMeetings({
    councilMeetings,
    cityId,
    timezone,
    canEdit,
    currentPage,
    totalPages,
    pageSize
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');

    const administrativeBodies = getAdministrativeBodiesForMeetings(councilMeetings);
    const defaultFilterValues = getDefaultAdministrativeBodyFilters(administrativeBodies);

    return (
        <List
            items={councilMeetings}
            editable={canEdit}
            ItemComponent={MeetingCard}
            itemProps={{ cityTimezone: timezone }}
            FormComponent={AddMeetingForm}
            formProps={{ cityId }}
            t={t}
            filterAvailableValues={administrativeBodies}
            filter={(selectedValues, meeting: CouncilMeetingWithAdminBodyAndSubjects) => selectedValues.includes(meeting.administrativeBody?.id ?? null)}
            defaultFilterValues={defaultFilterValues}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
            pagination={currentPage && totalPages ? {
                currentPage,
                totalPages,
                pageSize: pageSize || 12
            } : undefined}
        />
    );
} 