import { AdministrativeBody, CouncilMeeting, SpeakerContribution, Topic } from '@prisma/client';
import type { PersonWithRelations } from '../people';

export type ContributionForPerson = SpeakerContribution & {
    speaker: PersonWithRelations | null;
    subject: {
        id: string;
        name: string;
        cityId: string;
        councilMeetingId: string;
        topic: Topic | null;
        councilMeeting: CouncilMeeting & {
            administrativeBody: AdministrativeBody | null;
        };
    };
};
