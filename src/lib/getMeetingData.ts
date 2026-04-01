import { getCouncilMeeting, CouncilMeetingWithAdminBody } from '@/lib/db/meetings';
import { getTranscript, Transcript } from '@/lib/db/transcript';
import { CityWithGeometry, getCity } from '@/lib/db/cities';
import { PersonWithRelations } from '@/lib/db/people';
import { getHighlightsForMeeting, HighlightWithUtterances } from '@/lib/db/highlights';
import { cache } from 'react';
import { getPeopleForCityCached, getPartiesForCityCached } from '@/lib/cache/queries';
import { getSubjectsForMeeting, SubjectWithRelations } from '@/lib/db/subject';
import { getBatchStatisticsForSubjects, Statistics } from '@/lib/statistics';
import { getMeetingTaskStatus, MeetingTaskStatus } from '@/lib/db/tasks';
import { createCache } from '@/lib/cache';
import { SpeakerTag } from '@prisma/client';
import { Party } from '@prisma/client';

const EMPTY_STATISTICS: Statistics = {
    speakingSeconds: 0,
    people: [],
    parties: [],
    topics: []
};

export type MeetingDataCore = {
    meeting: CouncilMeetingWithAdminBody;
    transcript: Transcript;
    city: CityWithGeometry;
    people: PersonWithRelations[];
    parties: Party[];
    subjects: (SubjectWithRelations & { statistics?: Statistics })[];
    speakerTags: SpeakerTag[];
    taskStatus: MeetingTaskStatus;
    transcriptHiddenForReview: boolean;
}

export type MeetingData = MeetingDataCore & {
    highlights: HighlightWithUtterances[];
}

/**
 * Fetches all meeting data except user-specific highlights.
 * Individual sub-queries are cached with unstable_cache where possible.
 * The meeting query and transcript are NOT cached (auth + size constraints).
 */
export const getMeetingDataCore = async (cityId: string, meetingId: string): Promise<MeetingDataCore> => {
    console.log(`getMeetingDataCore ${cityId}/${meetingId}`);
    const meetingTags = { tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`, `city:${cityId}:meeting:${meetingId}`] };
    const cityTags = { tags: ['city', `city:${cityId}`, `city:${cityId}:basic`] };

    const [meeting, transcript, city, people, parties, subjects, taskStatus] = await Promise.all([
        // Meeting query is NOT cached — it calls isUserAuthorizedToEdit (uses headers())
        // to allow admins to view unreleased meetings. It's a fast PK lookup anyway.
        getCouncilMeeting(cityId, meetingId),
        // Transcript is NOT cached — too large for the 2MB unstable_cache limit
        getTranscript(meetingId, cityId),
        createCache(
            () => getCity(cityId, { includeGeometry: true }),
            ['city', cityId, 'withGeometry'],
            cityTags
        )(),
        getPeopleForCityCached(cityId),
        getPartiesForCityCached(cityId),
        createCache(
            () => getSubjectsForMeeting(cityId, meetingId),
            ['city', cityId, 'meeting', meetingId, 'subjects'],
            meetingTags
        )(),
        createCache(
            () => getMeetingTaskStatus(cityId, meetingId),
            ['city', cityId, 'meeting', meetingId, 'taskStatus'],
            meetingTags
        )()
    ]);

    if (!meeting || !city || !transcript || !subjects) {
        throw new Error('Required data not found');
    }

    // Cache statistics as a plain object (Map doesn't JSON-serialize)
    const statisticsRecord = await createCache(
        async () => {
            const map = await getBatchStatisticsForSubjects(subjects.map(s => s.id), meeting.dateTime);
            return Object.fromEntries(map);
        },
        ['city', cityId, 'meeting', meetingId, 'subjectStatistics'],
        meetingTags
    )();
    const subjectsWithStatistics = subjects.map(subject => ({
        ...subject,
        statistics: statisticsRecord[subject.id] ?? EMPTY_STATISTICS
    }));

    // Extract unique speaker tags in O(n) using Map
    const speakerTagsMap = new Map<string, SpeakerTag>();
    for (const segment of transcript) {
        if (!speakerTagsMap.has(segment.speakerTag.id)) {
            speakerTagsMap.set(segment.speakerTag.id, segment.speakerTag);
        }
    }
    const speakerTags = Array.from(speakerTagsMap.values());

    const transcriptHiddenForReview = !taskStatus.humanReview
        && meeting.administrativeBody?.showUnreviewedTranscript === false;

    return {
        meeting,
        transcript,
        city,
        people,
        parties,
        subjects: subjectsWithStatistics,
        speakerTags,
        taskStatus,
        transcriptHiddenForReview
    };
}

/**
 * Cached version of getMeetingData that composes:
 * 1. Core data (sub-queries individually cached inside getMeetingDataCore)
 * 2. Fresh user-specific highlights (fetched per-request)
 *
 * Outer React cache() deduplicates within a single request (layout calls this 3x).
 * Note: the transcript is NOT cached (too large for 2MB unstable_cache limit),
 * but all other sub-queries are individually cached inside getMeetingDataCore.
 */
export const getMeetingDataCached = cache(async (
  cityId: string,
  meetingId: string
): Promise<MeetingData | null> => {
  const startTime = performance.now();

  try {
    const [core, highlights] = await Promise.all([
      getMeetingDataCore(cityId, meetingId),
      getHighlightsForMeeting(cityId, meetingId)
    ]);
    const ms = (performance.now() - startTime).toFixed(0);
    console.log(`getMeetingDataCached ${cityId}/${meetingId} done in ${ms}ms (${highlights.length} highlights)`);
    return { ...core, highlights };
  } catch (error) {
    console.error(`getMeetingDataCached ${cityId}/${meetingId} ERROR:`, error);
    return null;
  }
});

/**
 * Helper function to get a specific subject from cached meeting data
 */
export async function getSubjectFromMeetingCached(cityId: string, meetingId: string, subjectId: string) {
  const meetingData = await getMeetingDataCached(cityId, meetingId);

  if (!meetingData) {
    return null;
  }

  const subject = meetingData.subjects.find(s => s.id === subjectId);
  return subject || null;
}
