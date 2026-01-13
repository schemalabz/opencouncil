"use client";
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import MeetingCard from '@/components/meetings/MeetingCard';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { PaginationParams } from '@/lib/db/types';

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

    const administrativeBodies = Array.from(new Map(councilMeetings
        .map(meeting => [
            meeting.administrativeBody?.id,
            {
                value: meeting.administrativeBody?.id,
                label: meeting.administrativeBody?.name || "Χωρίς διοικητικό όργανο"
            }
        ])
    ).values());

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
            filter={(selectedValues, meeting: CouncilMeetingWithAdminBodyAndSubjects) => selectedValues.includes(meeting.administrativeBody?.id)}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
            pagination={currentPage && pageSize ? {
                currentPage,
                totalPages: 0,
                pageSize
            } : undefined}
        />
    );
} 