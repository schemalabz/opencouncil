import { getCouncilMeeting, CouncilMeetingWithAdminBody } from '@/lib/db/meetings';
import { getTranscript, Transcript } from '@/lib/db/transcript';
import { CityWithGeometry, getCity } from '@/lib/db/cities';
import { PersonWithRelations } from '@/lib/db/people';
import { getHighlightsForMeeting, HighlightWithUtterances } from '@/lib/db/highlights';
import { cache } from 'react';
import { getPeopleForCityCached, getPartiesForCityCached, getSubjectsForMeetingCached, getSubjectStatisticsCached } from '@/lib/cache/queries';
import { SubjectWithRelations } from '@/lib/db/subject';
import { Statistics } from '@/lib/statistics';
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
 * Process-local inflight map for getMeetingDataCore. Coalesces concurrent
 * calls for the same (cityId, meetingId) onto a single Promise.
 *
 * Fills the gap between React.cache() (intra-request only) and unstable_cache
 * (which deliberately bypasses the transcript fetch because it's >2MB). Under
 * RSC <Link prefetch> cascades the same meeting was being fetched 20+ times
 * in <6s — each refetch a multi-MB transcript pull from PG over the Atlantic
 * plus an O(n_segments) JS walk — eventually pegging CPU and freezing the
 * event loop on the single-vCPU container.
 *
 * Entries are removed when the underlying Promise settles, so this is bounded
 * to whatever's actually in-flight; it's not a long-lived cache.
 */
const coreInflight = new Map<string, Promise<MeetingDataCore>>();

/**
 * Fetches all meeting data except user-specific highlights.
 * Individual sub-queries are cached with unstable_cache where possible.
 * The meeting query and transcript are NOT cached (auth + size constraints).
 * Concurrent callers for the same (cityId, meetingId) are coalesced via
 * coreInflight above.
 */
export const getMeetingDataCore = async (cityId: string, meetingId: string): Promise<MeetingDataCore> => {
    // PROBE: top 3 caller frames so we can see who's invoking Core during freeze.
    // Skip [0] "Error", [1] "at getMeetingDataCore" — we want the actual caller.
    const callerHint = new Error().stack
        ?.split('\n')
        .slice(2, 5)
        .map(l => l.trim())
        .join(' ← ') ?? 'unknown';
    const key = `${cityId}/${meetingId}`;

    const existing = coreInflight.get(key);
    if (existing) {
        console.log(`getMeetingDataCore ${key} DEDUPED from: ${callerHint}`);
        return existing;
    }

    console.log(`getMeetingDataCore ${key} LEADER from: ${callerHint}`);
    const promise = fetchMeetingDataCore(cityId, meetingId);
    coreInflight.set(key, promise);
    // The cleanup fork: .finally() returns a NEW promise that also rejects
    // when the fetch fails. Callers handle the original `promise`; nothing
    // handles the fork, so without the .catch() a failed fetch surfaces as
    // an unhandledRejection on the Node runtime.
    promise.finally(() => coreInflight.delete(key)).catch(() => {});
    return promise;
};

async function fetchMeetingDataCore(cityId: string, meetingId: string): Promise<MeetingDataCore> {
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
        getSubjectsForMeetingCached(cityId, meetingId),
        createCache(
            () => getMeetingTaskStatus(cityId, meetingId),
            ['city', cityId, 'meeting', meetingId, 'taskStatus'],
            meetingTags
        )()
    ]);

    if (!meeting || !city || !transcript || !subjects) {
        throw new Error('Required data not found');
    }

    const statisticsRecord = await getSubjectStatisticsCached(cityId, meetingId, subjects, meeting.dateTime);
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
  // PROBE: per-request id. React.cache() is request-scoped, so the same reqId
  // appears across all Cached calls within one request; a new reqId per
  // separate request. Distinct ids on the same meeting in <5s = request
  // stampede (likely from RSC <Link prefetch> on subject links).
  const reqId = crypto.randomUUID().slice(0, 8);
  const startTime = performance.now();
  console.log(`getMeetingDataCached[${reqId}] ENTER ${cityId}/${meetingId}`);

  try {
    const [core, highlights] = await Promise.all([
      getMeetingDataCore(cityId, meetingId),
      getHighlightsForMeeting(cityId, meetingId)
    ]);
    const ms = (performance.now() - startTime).toFixed(0);
    console.log(`getMeetingDataCached[${reqId}] DONE ${cityId}/${meetingId} in ${ms}ms (${highlights.length} highlights)`);
    return { ...core, highlights };
  } catch (error) {
    console.error(`getMeetingDataCached[${reqId}] ERROR ${cityId}/${meetingId}:`, error);
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
