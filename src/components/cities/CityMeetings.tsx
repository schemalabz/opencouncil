"use client";
import { AdministrativeBody, CouncilMeeting } from '@prisma/client';
import { useTranslations } from 'next-intl';
import List from '@/components/List';
import MeetingCard from '@/components/meetings/MeetingCard';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { SubjectWithRelations } from '@/lib/db/subject';

type CityMeetingsProps = {
    councilMeetings: (CouncilMeeting & { 
        subjects: SubjectWithRelations[], 
        administrativeBody: AdministrativeBody | null 
    })[],
    cityId: string,
    timezone: string,
    canEdit: boolean
};

export default function CityMeetings({ 
    councilMeetings, 
    cityId, 
    timezone,
    canEdit
}: CityMeetingsProps) {
    const t = useTranslations('CouncilMeeting');

    const orderedMeetings = [...councilMeetings]
        .filter(meeting => canEdit || meeting.released)
        .sort((a, b) => {
            const timeCompare = new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
            if (timeCompare === 0) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return timeCompare;
        });

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
            items={orderedMeetings}
            editable={canEdit}
            ItemComponent={MeetingCard}
            itemProps={{ cityTimezone: timezone }}
            FormComponent={AddMeetingForm}
            formProps={{ cityId }}
            t={t}
            filterAvailableValues={administrativeBodies}
            filter={(selectedValues, meeting) => selectedValues.includes(meeting.administrativeBody?.id)}
            smColumns={1}
            mdColumns={2}
            lgColumns={3}
            allText="Όλα τα όργανα"
        />
    );
} 