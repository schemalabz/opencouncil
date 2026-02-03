import { getCouncilMeeting } from '@/lib/db/meetings';
import { getTranscript, Transcript } from '@/lib/db/transcript';
import { CityWithGeometry, getCity } from '@/lib/db/cities';
import { getPeopleForCity, PersonWithRelations } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getHighlightsForMeeting, HighlightWithUtterances } from '@/lib/db/highlights';
import { getSubjectsForMeeting, SubjectWithRelations } from '@/lib/db/subject';
import { getStatisticsFor, Statistics } from '@/lib/statistics';
import { getMeetingTaskStatus, MeetingTaskStatus } from '@/lib/db/tasks';
import { CouncilMeeting, SpeakerTag, TaskStatus } from '@prisma/client';
import { Party } from '@prisma/client';

export type MeetingData = {
    meeting: CouncilMeeting;
    transcript: Transcript;
    city: CityWithGeometry;
    people: PersonWithRelations[];
    parties: Party[];
    highlights: HighlightWithUtterances[];
    subjects: (SubjectWithRelations & { statistics?: Statistics })[];
    speakerTags: SpeakerTag[];
    taskStatus: MeetingTaskStatus;
}

export const getMeetingData = async (cityId: string, meetingId: string): Promise<MeetingData> => {
    console.log('getting meeting data for', cityId, meetingId);
    const [meeting, transcript, city, people, parties, highlights, subjects, taskStatus] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getTranscript(meetingId, cityId),
        getCity(cityId, { includeGeometry: true }),
        getPeopleForCity(cityId),
        getPartiesForCity(cityId),
        getHighlightsForMeeting(cityId, meetingId),
        getSubjectsForMeeting(cityId, meetingId),
        getMeetingTaskStatus(cityId, meetingId)
    ]);

    if (!meeting || !city || !transcript || !subjects) {
        throw new Error('Required data not found');
    }

    const subjectsWithStatistics = await Promise.all(subjects.map(async (subject) => ({
        ...subject,
        statistics: await getStatisticsFor({ subjectId: subject.id }, ["person", "party"])
    })));

    // Extract unique speaker tags in O(n) using Map
    const speakerTagsMap = new Map<string, SpeakerTag>();
    for (const segment of transcript) {
        if (!speakerTagsMap.has(segment.speakerTag.id)) {
            speakerTagsMap.set(segment.speakerTag.id, segment.speakerTag);
        }
    }
    const speakerTags = Array.from(speakerTagsMap.values());

    return { 
        meeting, 
        transcript, 
        city, 
        people, 
        parties, 
        highlights, 
        subjects: subjectsWithStatistics, 
        speakerTags,
        taskStatus
    };
}
