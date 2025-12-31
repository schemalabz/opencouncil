'use server'
import { Prisma } from '@prisma/client';
import prisma from './prisma';

// ============================================================================
// SHARED PRISMA PATTERNS
// ============================================================================

/**
 * Meeting identifier type for consistent parameter passing
 */
type MeetingId = {
  cityId: string;
  meetingId: string;
};

/**
 * Reusable WHERE clause builders for consistent queries
 * All functions accept MeetingId to avoid param order mistakes
 */
const whereClause = {
  /** Match utterances by meeting */
  utterancesByMeeting: ({ cityId, meetingId }: MeetingId): Prisma.UtteranceWhereInput => ({
    speakerSegment: { meetingId, cityId },
  }),
  
  /** Match user edits by meeting */
  userEditsByMeeting: ({ cityId, meetingId }: MeetingId): Prisma.UtteranceEditWhereInput => ({
    editedBy: 'user',
    utterance: {
      speakerSegment: { meetingId, cityId },
    },
  }),
  
  /** Match succeeded task statuses for review tracking */
  reviewTaskStatuses: (): Prisma.TaskStatusWhereInput => ({
    type: { in: ['fixTranscript', 'humanReview'] },
    status: 'succeeded'
  }),
};

/**
 * Reusable SELECT/INCLUDE patterns
 */
const selectPattern = {
  /** User info for reviewers */
  user: { id: true, name: true, email: true } as const,
  
  /** City name */
  cityName: { name: true } as const,
};

/**
 * Reusable INCLUDE patterns for meetings with review data
 */
const includePattern = {
  /** Basic meeting info with city and relevant task statuses */
  meetingWithReviewInfo: () => ({
    city: { select: selectPattern.cityName },
    taskStatuses: {
      where: whereClause.reviewTaskStatuses(),
      orderBy: { createdAt: 'desc' as const }
    }
  }),
  
  /** Utterances with user edits for session calculation */
  utterancesForSessions: () => ({
    utteranceEdits: {
      where: { editedBy: 'user' as const },
      include: {
        user: { select: selectPattern.user }
      },
      orderBy: { createdAt: 'asc' as const }
    }
  }),
};

/**
 * Helper to build meeting composite key
 */
const meetingKey = (cityId: string, meetingId: string) => ({
  cityId_id: { cityId, id: meetingId }
});

// ============================================================================
// SHARED TYPES
// ============================================================================

/**
 * Reviewer information structure
 * Used consistently across the review tracking system
 */
export interface ReviewerInfo {
  userId: string;
  userName: string | null;
  userEmail: string;
  editCount: number;
}

/**
 * Utterance with nested edits structure
 * Used for session calculation - matches the shape we load for sessions
 */
export type UtteranceWithEdits = Prisma.UtteranceGetPayload<{
  include: {
    utteranceEdits: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
          }
        }
      }
    }
  }
}>;

// ============================================================================
// EXPORTED INTERFACES
// ============================================================================

export type ReviewStatus = 'needsReview' | 'inProgress' | 'completed';

export interface ReviewStats {
  needsReview: number;
  inProgress: number;
  completedToday: number;
  completedThisWeek: number;
}

/**
 * Light review data for list view (no session calculations)
 */
export interface ReviewListItem {
  meetingId: string;
  cityId: string;
  cityName: string;
  meetingName: string;
  meetingDate: Date;
  status: ReviewStatus;
  totalUtterances: number;
  reviewedUtterances: number;
  userEditedUtterances: number;
  taskEditedUtterances: number;
  progressPercentage: number;
  reviewers: ReviewerInfo[];
  primaryReviewer: ReviewerInfo | null;
  firstEditAt: Date | null;
  lastEditAt: Date | null;
  meetingDurationMs: number;
  reviewDurationMs: number | null;
}

/**
 * Full review data with session calculations (for detail view)
 */
export interface ReviewDetail extends ReviewListItem {
  estimatedReviewTimeMs: number;
  reviewSessions: number;
  unifiedReviewSessions: UnifiedReviewSession[];
  totalReviewTimeMs: number;
  totalReviewEfficiency: number | null;
  reviewEfficiency: number | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Filter edits to only include user-made edits
 */
function isUserEdit(edit: UtteranceWithEdits['utteranceEdits'][0]): boolean {
  return edit.editedBy === 'user';
}

/**
 * Calculate the duration of an utterance in seconds
 */
function getUtteranceDurationSeconds(utterance: Pick<UtteranceWithEdits, 'startTimestamp' | 'endTimestamp'>): number {
  return utterance.endTimestamp - utterance.startTimestamp;
}

/**
 * Determine review status based on task completion and progress
 */
function determineReviewStatus(
  hasFixTranscript: boolean,
  hasHumanReview: boolean,
  reviewedUtterances: number
): ReviewStatus {
  if (!hasFixTranscript) {
    throw new Error('Cannot determine status for meeting without fixTranscript');
  }
  
  if (hasHumanReview) {
    return 'completed';
  }
  
  if (reviewedUtterances === 0) {
    return 'needsReview';
  }
  
  return 'inProgress';
}

// ============================================================================
// REVIEW TIME ESTIMATION ALGORITHM
// ============================================================================
//
// This algorithm estimates the actual time a reviewer spent working on a
// transcript, excluding breaks and interruptions.
//
// KEY INSIGHT: The gap between edits includes both:
// 1. Time spent reading/reviewing utterances that didn't need editing
// 2. Breaks/interruptions (coffee, meetings, etc.)
//
// APPROACH: We use utterance durations to separate work from breaks:
// - Calculate expected review time based on audio duration of utterances
// - If actual time exceeds expected + threshold, it's a break (new session)
// - Sum up all session durations for total review time
//
// EXAMPLE:
// Edit at 10:00 on utterance #100
// Edit at 10:25 on utterance #300
// Utterances 101-299 total audio: 15 minutes
// Expected review time: 15 min × 1.5 = 22.5 minutes
// Actual time: 25 minutes
// Excess: 2.5 minutes → Still same session (minor pause)
//
// But if actual time was 45 minutes:
// Excess: 22.5 minutes → New session (took a break)
// ============================================================================

/**
 * Configuration for review time estimation
 * 
 * These values can be tuned based on observed reviewer behavior.
 * Not exported because this is a 'use server' file (only async functions can be exported).
 * If you need to access these values from client components, create a separate config file.
 */
const REVIEW_TIME_CONFIG = {
  // How much slower than audio speed do people review?
  // 1.0 = same as speaking speed
  // 1.5 = 50% slower (recommended - allows time to read, think)
  // 2.0 = twice as slow (very careful review)
  REVIEW_SPEED_MULTIPLIER: 1.5,
  
  // Maximum "excess time" before we consider it a break (in minutes)
  // This is time beyond the expected review duration
  MAX_EXCESS_TIME_MINUTES: 10,
  
  // Time to add at the end of each session (wrap-up time)
  SESSION_BUFFER_MINUTES: 2,
  
  // Minimum time to credit for a single edit (in minutes)
  SINGLE_EDIT_TIME_MINUTES: 3,
} as const;

// Export session type for UI components
export interface ReviewSession {
  startTime: Date;
  endTime: Date;
  utterancesCovered: number;
  durationMs: number;
  meetingStartTimestamp: number; // Start timestamp of the earliest utterance edited in this session (in seconds)
  meetingEndTimestamp: number; // End timestamp of the latest utterance edited in this session (in seconds)
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string;
}

// Unified session across all reviewers
export interface UnifiedReviewSession extends ReviewSession {
  isPrimaryReviewer: boolean;
}

/**
 * Edited utterance with timestamp and metadata
 */
interface EditedUtterance {
  utteranceIndex: number;
  utterance: UtteranceWithEdits;
  firstEditTime: Date;
  reviewerName: string | null;
  reviewerEmail: string;
}

/**
 * Helper function to build a session from a range of edited utterances
 */
function buildSession(
  editedUtterances: EditedUtterance[],
  startIdx: number,
  endIdx: number,
  reviewerId: string
): ReviewSession {
  const sessionEdits = editedUtterances.slice(startIdx, endIdx + 1);
  const startTime = sessionEdits[0].firstEditTime;
  const endTime = sessionEdits[sessionEdits.length - 1].firstEditTime;
  
  // Calculate session duration (time from first to last edit + buffer)
  const sessionDurationMs = endTime.getTime() - startTime.getTime();
  const bufferMs = REVIEW_TIME_CONFIG.SESSION_BUFFER_MINUTES * 60 * 1000;
  
  // Count unique utterances
  const utteranceIndices = new Set(sessionEdits.map(e => e.utteranceIndex));
  
  // Find meeting timestamp range covered
  const sessionUtterances = sessionEdits.map(e => e.utterance);
  const meetingStartTimestamp = Math.min(...sessionUtterances.map(u => u.startTimestamp));
  const meetingEndTimestamp = Math.max(...sessionUtterances.map(u => u.endTimestamp));
  
  return {
    startTime,
    endTime,
    utterancesCovered: utteranceIndices.size,
    durationMs: Math.max(0, sessionDurationMs) + bufferMs,
    meetingStartTimestamp,
    meetingEndTimestamp,
    reviewerId,
    reviewerName: sessionEdits[0].reviewerName,
    reviewerEmail: sessionEdits[0].reviewerEmail,
  };
}

/**
 * Calculate estimated review time for a reviewer
 * 
 * Leverages the nested structure of utterances with their edits.
 * For utterances with multiple edits, uses the FIRST edit timestamp (initial review).
 * 
 * @param reviewerId - User ID of the reviewer
 * @param allUtterances - All utterances in the meeting (already sorted by position with nested edits)
 * @returns Estimated review time in milliseconds and session breakdown
 */
function calculateReviewTime(
  reviewerId: string,
  allUtterances: UtteranceWithEdits[]
): { totalTimeMs: number; sessions: ReviewSession[] } {
  // Collect edited utterances with timestamps
  const editedUtterances: EditedUtterance[] = [];
  
  for (let i = 0; i < allUtterances.length; i++) {
    const utterance = allUtterances[i];
    
    // Find first edit by this reviewer on this utterance
    const reviewerEditsOnThis = utterance.utteranceEdits
      .filter(e => isUserEdit(e) && e.user?.id === reviewerId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    if (reviewerEditsOnThis.length > 0) {
      const firstEdit = reviewerEditsOnThis[0];
      editedUtterances.push({
        utteranceIndex: i,
        utterance,
        firstEditTime: firstEdit.createdAt,
        reviewerName: firstEdit.user?.name ?? null,
        reviewerEmail: firstEdit.user?.email ?? '',
      });
    }
  }
  
  if (editedUtterances.length === 0) {
    return { totalTimeMs: 0, sessions: [] };
  }
  
  // Handle single edit case
  if (editedUtterances.length === 1) {
    const singleEditTimeMs = REVIEW_TIME_CONFIG.SINGLE_EDIT_TIME_MINUTES * 60 * 1000;
    const edited = editedUtterances[0];
    const session: ReviewSession = {
      startTime: edited.firstEditTime,
      endTime: edited.firstEditTime,
      utterancesCovered: 1,
      durationMs: singleEditTimeMs,
      meetingStartTimestamp: edited.utterance.startTimestamp,
      meetingEndTimestamp: edited.utterance.endTimestamp,
      reviewerId,
      reviewerName: edited.reviewerName,
      reviewerEmail: edited.reviewerEmail,
    };
    
    return {
      totalTimeMs: singleEditTimeMs,
      sessions: [session]
    };
  }
  
  // Sort edited utterances by EDIT TIME (chronologically)
  // This ensures session times flow forward even if reviewer jumped around
  editedUtterances.sort((a, b) => a.firstEditTime.getTime() - b.firstEditTime.getTime());
  
  // Detect sessions by analyzing gaps between consecutive edits
  const sessions: ReviewSession[] = [];
  let sessionStartIdx = 0;
  
  for (let i = 1; i < editedUtterances.length; i++) {
    const prevEdited = editedUtterances[i - 1];
    const currentEdited = editedUtterances[i];
    
    // Calculate time gap between edits (chronologically)
    const timeGapMs = currentEdited.firstEditTime.getTime() - prevEdited.firstEditTime.getTime();
    
    // Get utterances in the range between these two positions
    const minPos = Math.min(prevEdited.utteranceIndex, currentEdited.utteranceIndex);
    const maxPos = Math.max(prevEdited.utteranceIndex, currentEdited.utteranceIndex);
    const utterancesBetween = allUtterances.slice(minPos + 1, maxPos + 1);
    
    // Calculate total audio duration of utterances between edits
    const audioDurationSeconds = utterancesBetween.reduce(
      (sum, u) => sum + getUtteranceDurationSeconds(u),
      0
    );
    
    // Expected review time = audio duration × speed multiplier
    const expectedReviewTimeMs = audioDurationSeconds * 1000 * REVIEW_TIME_CONFIG.REVIEW_SPEED_MULTIPLIER;
    
    // Excess time = time beyond what we'd expect for reviewing the utterances
    const excessTimeMs = timeGapMs - expectedReviewTimeMs;
    const maxExcessMs = REVIEW_TIME_CONFIG.MAX_EXCESS_TIME_MINUTES * 60 * 1000;
    
    // If excess time is too large, end current session and start new one
    if (excessTimeMs >= maxExcessMs || timeGapMs < 0) {
      // Save the completed session
      const session = buildSession(editedUtterances, sessionStartIdx, i - 1, reviewerId);
      sessions.push(session);
      
      // Start new session
      sessionStartIdx = i;
    }
  }
  
  // Add the final session
  const lastSession = buildSession(
    editedUtterances,
    sessionStartIdx,
    editedUtterances.length - 1,
    reviewerId
  );
  sessions.push(lastSession);
  
  // Calculate total time across all sessions
  const totalTimeMs = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  
  return { totalTimeMs, sessions };
}

/**
 * Calculate unified review sessions across all reviewers
 * Returns all sessions merged chronologically with reviewer identification
 */
function calculateUnifiedReviewSessions(
  allReviewers: ReviewerInfo[],
  primaryReviewerId: string | null,
  allUtterances: UtteranceWithEdits[]
): UnifiedReviewSession[] {
  const allSessions: UnifiedReviewSession[] = [];
  
  // Calculate sessions for each reviewer
  for (const reviewer of allReviewers) {
    const { sessions } = calculateReviewTime(reviewer.userId, allUtterances);
    
    // Convert to UnifiedReviewSession with primary reviewer flag
    for (const session of sessions) {
      allSessions.push({
        ...session,
        isPrimaryReviewer: reviewer.userId === primaryReviewerId,
      });
    }
  }
  
  // Sort all sessions chronologically
  allSessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  return allSessions;
}

/**
 * Calculate session data from loaded utterances with edits
 * Used only for detail view when full session breakdown is needed
 * 
 * @param allUtterances - Utterances with nested edits (sorted by timestamp)
 * @param reviewers - List of reviewers with edit counts
 * @param primaryReviewerId - ID of primary reviewer (most edits)
 * @returns Session calculations (times, sessions, efficiency)
 */
function calculateSessionData(
  allUtterances: UtteranceWithEdits[],
  reviewers: ReviewerInfo[],
  primaryReviewerId: string | null,
  meetingDurationMs: number
): {
  estimatedReviewTimeMs: number;
  reviewSessions: number;
  unifiedReviewSessions: UnifiedReviewSession[];
  totalReviewTimeMs: number;
  totalReviewEfficiency: number | null;
  reviewEfficiency: number | null;
} {
  // Calculate unified review sessions across all reviewers
  const unifiedReviewSessions = calculateUnifiedReviewSessions(
    reviewers,
    primaryReviewerId,
    allUtterances
  );
  
  // Derive primary reviewer stats from unified sessions
  const primaryReviewerSessions = unifiedReviewSessions.filter(
    s => s.isPrimaryReviewer
  );
  const estimatedReviewTimeMs = primaryReviewerSessions.reduce(
    (sum, session) => sum + session.durationMs, 
    0
  );
  const reviewSessions = primaryReviewerSessions.length;
  
  // Calculate total review time from all reviewers
  const totalReviewTimeMs = unifiedReviewSessions.reduce(
    (sum, session) => sum + session.durationMs, 
    0
  );
  
  // Calculate review efficiency
  const reviewEfficiency = meetingDurationMs > 0 && estimatedReviewTimeMs > 0
    ? estimatedReviewTimeMs / meetingDurationMs
    : null;
  
  const totalReviewEfficiency = meetingDurationMs > 0 && totalReviewTimeMs > 0
    ? totalReviewTimeMs / meetingDurationMs
    : null;
  
  return {
    estimatedReviewTimeMs,
    reviewSessions,
    unifiedReviewSessions,
    totalReviewTimeMs,
    totalReviewEfficiency,
    reviewEfficiency,
  };
}

// ============================================================================
// REVIEW FILTERING SYSTEM
// ============================================================================
//
// This section implements a two-stage filtering system for review data:
//
// STAGE 1: DATABASE FILTERING (Prisma WHERE conditions)
//   - Reduces dataset before fetching from database
//   - Filters by task status (fixTranscript, humanReview)
//   - Filters meetings where user has made ANY edits (for reviewer filter)
//   - More efficient: Less data transferred and processed
//
// STAGE 2: JAVASCRIPT FILTERING (after fetch)
//   - Calculates detailed review progress for each meeting
//   - Verifies user is PRIMARY reviewer (most edits), not just any contributor
//   - Excludes meetings that don't meet final criteria
//
// FILTER OPTIONS:
//   show: 'needsAttention' (default) - Has fixTranscript, no humanReview
//         'all' - Has fixTranscript (any humanReview status)
//         'completed' - Has both fixTranscript AND humanReview
//   
//   reviewerId: Filter to show only meetings where specified user is primary reviewer
//
// ============================================================================

/**
 * Filter options for getMeetingsNeedingReview
 */
export interface ReviewFilterOptions {
  show?: 'needsAttention' | 'all' | 'completed';
  reviewerId?: string;
}

// ============================================================================
// FILTER HELPER FUNCTIONS
// ============================================================================

/**
 * Build database where conditions for review status filtering
 */
function buildStatusWhereConditions(show: ReviewFilterOptions['show']): Prisma.CouncilMeetingWhereInput {
  const hasFixTranscript = {
    taskStatuses: {
      some: {
        type: 'fixTranscript' as const,
        status: 'succeeded' as const
      }
    }
  };

  const hasHumanReview = {
    taskStatuses: {
      some: {
        type: 'humanReview' as const,
        status: 'succeeded' as const
      }
    }
  };

  switch (show) {
    case 'needsAttention':
      // Has fixTranscript but NOT humanReview
      return {
        AND: [
          hasFixTranscript,
          { NOT: hasHumanReview }
        ]
      };

    case 'completed':
      // Has both fixTranscript AND humanReview
      return {
        AND: [
          hasFixTranscript,
          hasHumanReview
        ]
      };

    case 'all':
    default:
      // Just needs fixTranscript (includes all statuses)
      return hasFixTranscript;
  }
}

/**
 * Build database where conditions for reviewer filtering
 */
function buildReviewerWhereConditions(reviewerId: string): Prisma.CouncilMeetingWhereInput {
  return {
    speakerSegments: {
      some: {
        utterances: {
          some: {
            utteranceEdits: {
              some: {
                editedBy: 'user',
                userId: reviewerId
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Combine multiple where conditions using AND
 */
function combineWhereConditions(
  conditions: Prisma.CouncilMeetingWhereInput[]
): Prisma.CouncilMeetingWhereInput {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  
  return { AND: conditions };
}


/**
 * Get aggregated stats for a meeting without loading full nested data
 * Used for efficient list views
 */
async function getAggregatedMeetingStats(
  meeting: MeetingId
): Promise<Omit<ReviewListItem, 'meetingId' | 'cityId' | 'cityName' | 'meetingName' | 'meetingDate' | 'status'>> {
  const map = await getAggregatedMeetingStatsBatch([meeting]);
  return map.get(getMeetingMapKey(meeting)) ?? getEmptyAggregatedMeetingStats();
}

type AggregatedMeetingStats = Omit<
  ReviewListItem,
  'meetingId' | 'cityId' | 'cityName' | 'meetingName' | 'meetingDate' | 'status'
>;

function getMeetingMapKey(meeting: MeetingId): string {
  return `${meeting.cityId}:${meeting.meetingId}`;
}

function getEmptyAggregatedMeetingStats(): AggregatedMeetingStats {
  return {
    totalUtterances: 0,
    reviewedUtterances: 0,
    userEditedUtterances: 0,
    taskEditedUtterances: 0,
    progressPercentage: 0,
    reviewers: [],
    primaryReviewer: null,
    firstEditAt: null,
    lastEditAt: null,
    meetingDurationMs: 0,
    reviewDurationMs: null,
  };
}

async function getAggregatedMeetingStatsBatch(
  meetings: MeetingId[]
): Promise<Map<string, AggregatedMeetingStats>> {
  const statsByMeeting = new Map<string, AggregatedMeetingStats>();

  if (meetings.length === 0) return statsByMeeting;

  // Initialize defaults so missing rows still return valid stats.
  for (const meeting of meetings) {
    statsByMeeting.set(getMeetingMapKey(meeting), getEmptyAggregatedMeetingStats());
  }

  const meetingPairs = Prisma.join(
    meetings.map((m) => Prisma.sql`(${m.cityId}::text, ${m.meetingId}::text)`)
  );

  const [meetingAggRows, reviewerRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        cityId: string;
        meetingId: string;
        totalUtterances: bigint;
        reviewedUtterances: bigint;
        userEditedUtterances: bigint;
        taskEditedUtterances: bigint;
        firstEditAt: Date | null;
        lastEditAt: Date | null;
        minStartTimestamp: number | null;
        maxEndTimestamp: number | null;
      }>
    >`
      WITH meeting_pairs("cityId","meetingId") AS (VALUES ${meetingPairs}),
      utterances AS (
        SELECT
          ss."cityId" AS "cityId",
          ss."meetingId" AS "meetingId",
          u.id AS "utteranceId",
          u."startTimestamp" AS "startTimestamp",
          u."endTimestamp" AS "endTimestamp"
        FROM meeting_pairs mp
        LEFT JOIN "SpeakerSegment" ss
          ON ss."cityId" = mp."cityId" AND ss."meetingId" = mp."meetingId"
        LEFT JOIN "Utterance" u
          ON u."speakerSegmentId" = ss.id
      ),
      last_user_edit AS (
        SELECT
          ss."cityId" AS "cityId",
          ss."meetingId" AS "meetingId",
          MAX(u."startTimestamp") AS "lastTs"
        FROM meeting_pairs mp
        JOIN "SpeakerSegment" ss
          ON ss."cityId" = mp."cityId" AND ss."meetingId" = mp."meetingId"
        JOIN "Utterance" u ON u."speakerSegmentId" = ss.id
        JOIN "UtteranceEdit" ue ON ue."utteranceId" = u.id
        WHERE ue."editedBy" = 'user'
        GROUP BY ss."cityId", ss."meetingId"
      ),
      edit_distinct AS (
        SELECT
          ss."cityId" AS "cityId",
          ss."meetingId" AS "meetingId",
          COUNT(DISTINCT CASE WHEN ue."editedBy" = 'user' THEN ue."utteranceId" END)::bigint AS "userEditedUtterances",
          COUNT(DISTINCT CASE WHEN ue."editedBy" = 'task' THEN ue."utteranceId" END)::bigint AS "taskEditedUtterances",
          MIN(CASE WHEN ue."editedBy" = 'user' THEN ue."createdAt" END) AS "firstEditAt",
          MAX(CASE WHEN ue."editedBy" = 'user' THEN ue."createdAt" END) AS "lastEditAt"
        FROM meeting_pairs mp
        JOIN "SpeakerSegment" ss
          ON ss."cityId" = mp."cityId" AND ss."meetingId" = mp."meetingId"
        JOIN "Utterance" u ON u."speakerSegmentId" = ss.id
        JOIN "UtteranceEdit" ue ON ue."utteranceId" = u.id
        WHERE ue."editedBy" IN ('user', 'task')
        GROUP BY ss."cityId", ss."meetingId"
      )
      SELECT
        mp."cityId" AS "cityId",
        mp."meetingId" AS "meetingId",
        COALESCE(COUNT(u."utteranceId"), 0)::bigint AS "totalUtterances",
        COALESCE(
          COUNT(u."utteranceId") FILTER (
            WHERE l."lastTs" IS NOT NULL AND u."startTimestamp" <= l."lastTs"
          ),
          0
        )::bigint AS "reviewedUtterances",
        COALESCE(ed."userEditedUtterances", 0)::bigint AS "userEditedUtterances",
        COALESCE(ed."taskEditedUtterances", 0)::bigint AS "taskEditedUtterances",
        ed."firstEditAt" AS "firstEditAt",
        ed."lastEditAt" AS "lastEditAt",
        MIN(u."startTimestamp") AS "minStartTimestamp",
        MAX(u."endTimestamp") AS "maxEndTimestamp"
      FROM meeting_pairs mp
      LEFT JOIN utterances u
        ON u."cityId" = mp."cityId" AND u."meetingId" = mp."meetingId"
      LEFT JOIN last_user_edit l
        ON l."cityId" = mp."cityId" AND l."meetingId" = mp."meetingId"
      LEFT JOIN edit_distinct ed
        ON ed."cityId" = mp."cityId" AND ed."meetingId" = mp."meetingId"
      GROUP BY
        mp."cityId",
        mp."meetingId",
        l."lastTs",
        ed."userEditedUtterances",
        ed."taskEditedUtterances",
        ed."firstEditAt",
        ed."lastEditAt"
    `,

    prisma.$queryRaw<
      Array<{
        cityId: string;
        meetingId: string;
        userId: string;
        userName: string | null;
        userEmail: string;
        editCount: bigint;
      }>
    >`
      WITH meeting_pairs("cityId","meetingId") AS (VALUES ${meetingPairs})
      SELECT
        ss."cityId" AS "cityId",
        ss."meetingId" AS "meetingId",
        usr.id AS "userId",
        usr.name AS "userName",
        usr.email AS "userEmail",
        COUNT(*)::bigint AS "editCount"
      FROM meeting_pairs mp
      JOIN "SpeakerSegment" ss
        ON ss."cityId" = mp."cityId" AND ss."meetingId" = mp."meetingId"
      JOIN "Utterance" u ON u."speakerSegmentId" = ss.id
      JOIN "UtteranceEdit" ue ON ue."utteranceId" = u.id
      JOIN "User" usr ON usr.id = ue."userId"
      WHERE ue."editedBy" = 'user'
      GROUP BY ss."cityId", ss."meetingId", usr.id, usr.name, usr.email
      ORDER BY ss."cityId", ss."meetingId", "editCount" DESC
    `,
  ]);

  for (const row of meetingAggRows) {
    const key = getMeetingMapKey({ cityId: row.cityId, meetingId: row.meetingId });
    const existing = statsByMeeting.get(key) ?? getEmptyAggregatedMeetingStats();

    const totalUtterances = Number(row.totalUtterances);
    const reviewedUtterances = Number(row.reviewedUtterances);

    const meetingDurationMs =
      row.minStartTimestamp !== null && row.maxEndTimestamp !== null
        ? (row.maxEndTimestamp - row.minStartTimestamp) * 1000
        : 0;

    const progressPercentage =
      totalUtterances > 0 ? Math.round((reviewedUtterances / totalUtterances) * 100) : 0;

    statsByMeeting.set(key, {
      ...existing,
      totalUtterances,
      reviewedUtterances,
      userEditedUtterances: Number(row.userEditedUtterances),
      taskEditedUtterances: Number(row.taskEditedUtterances),
      firstEditAt: row.firstEditAt,
      lastEditAt: row.lastEditAt,
      meetingDurationMs,
      progressPercentage,
    });
  }

  const reviewersByMeeting = new Map<string, ReviewerInfo[]>();
  for (const row of reviewerRows) {
    const key = getMeetingMapKey({ cityId: row.cityId, meetingId: row.meetingId });
    const list = reviewersByMeeting.get(key) ?? [];
    list.push({
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      editCount: Number(row.editCount),
    });
    reviewersByMeeting.set(key, list);
  }

  for (const [key, reviewers] of reviewersByMeeting.entries()) {
    const existing = statsByMeeting.get(key) ?? getEmptyAggregatedMeetingStats();
    statsByMeeting.set(key, {
      ...existing,
      reviewers,
      primaryReviewer: reviewers.length > 0 ? reviewers[0] : null,
    });
  }

  return statsByMeeting;
}

/**
 * Get meetings for review with optional filters
 * Optimized for list views - uses aggregations, no session detection
 */
export async function getMeetingsNeedingReview(filters: ReviewFilterOptions = {}): Promise<ReviewListItem[]> {
  const { show = 'needsAttention', reviewerId } = filters;
  
  // Build database filter conditions
  const conditions: Prisma.CouncilMeetingWhereInput[] = [];
  
  // Add status filter
  conditions.push(buildStatusWhereConditions(show));
  
  // Add reviewer filter if specified
  // Note: This finds meetings where the user has made ANY edits
  // The "primary reviewer" check happens after fetching
  if (reviewerId) {
    conditions.push(buildReviewerWhereConditions(reviewerId));
  }
  
  // Combine all conditions
  const whereConditions = combineWhereConditions(conditions);
  
  // Fetch meetings from database (lightweight - no nested data)
  const meetings = await prisma.councilMeeting.findMany({
    where: whereConditions,
    include: includePattern.meetingWithReviewInfo(),
    orderBy: {
      dateTime: 'desc'
    }
  });

  // Note: DB filtering already ensures the correct fixTranscript/humanReview constraints
  // based on `show`. We only inspect taskStatuses here to determine `completed` vs not
  // for `show === 'all'`.
  const meetingIds: MeetingId[] = meetings.map((m) => ({ cityId: m.cityId, meetingId: m.id }));
  const statsByMeeting = await getAggregatedMeetingStatsBatch(meetingIds);

  const items: ReviewListItem[] = [];
  for (const m of meetings) {
    const stats = statsByMeeting.get(getMeetingMapKey({ cityId: m.cityId, meetingId: m.id })) ?? getEmptyAggregatedMeetingStats();

    // If filtering by reviewer, verify they are the PRIMARY reviewer
    if (reviewerId && stats.primaryReviewer?.userId !== reviewerId) {
      continue;
    }

    const hasHumanReview = m.taskStatuses.some(t => t.type === 'humanReview' && t.status === 'succeeded');
    const status = determineReviewStatus(true, hasHumanReview, stats.reviewedUtterances);

    const reviewDurationMs = stats.lastEditAt && m.dateTime
      ? stats.lastEditAt.getTime() - m.dateTime.getTime()
      : null;

    items.push({
      meetingId: m.id,
      cityId: m.cityId,
      cityName: m.city.name,
      meetingName: m.name,
      meetingDate: m.dateTime,
      status,
      ...stats,
      reviewDurationMs,
    });
  }

  return items;
}

/**
 * Get high-level review statistics
 */
export async function getReviewStats(): Promise<ReviewStats> {
  // We can derive needsReview/inProgress from presence of any user edits.
  const baseNeedsAttentionWhere: Prisma.CouncilMeetingWhereInput = buildStatusWhereConditions('needsAttention');

  const [needsReview, inProgress] = await Promise.all([
    // Needs review = has fixTranscript, no humanReview, and NO user edits
    prisma.councilMeeting.count({
      where: {
        AND: [
          baseNeedsAttentionWhere,
          {
            NOT: {
              speakerSegments: {
                some: {
                  utterances: {
                    some: {
                      utteranceEdits: {
                        some: { editedBy: 'user' },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }),
    // In progress = has fixTranscript, no humanReview, and HAS user edits
    prisma.councilMeeting.count({
      where: {
        AND: [
          baseNeedsAttentionWhere,
          {
            speakerSegments: {
              some: {
                utterances: {
                  some: {
                    utteranceEdits: {
                      some: { editedBy: 'user' },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }),
  ]);
  
  // Get completed reviews
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
  startOfWeek.setHours(0, 0, 0, 0);
  
  const completedReviews = await prisma.taskStatus.findMany({
    where: {
      type: 'humanReview',
      status: 'succeeded',
      createdAt: {
        gte: startOfWeek
      }
    }
  });
  
  const completedToday = completedReviews.filter(
    t => t.createdAt >= startOfToday
  ).length;
  
  const completedThisWeek = completedReviews.length;
  
  return {
    needsReview,
    inProgress,
    completedToday,
    completedThisWeek,
  };
}

/**
 * Get detailed review progress for a specific meeting with session calculations
 * Uses aggregations for basic data + loads utterances only for session calculation
 */
export async function getReviewProgressForMeeting(
  meetingId: MeetingId
): Promise<ReviewDetail | null> {
  // Get basic meeting info
  const meetingRecord = await prisma.councilMeeting.findUnique({
    where: meetingKey(meetingId.cityId, meetingId.meetingId),
    include: includePattern.meetingWithReviewInfo()
  });

  if (!meetingRecord) {
    return null;
  }

  // Get aggregated stats (same as list view)
  const stats = await getAggregatedMeetingStats(meetingId);

  // Check task statuses
  const hasFixTranscript = meetingRecord.taskStatuses.some(
    t => t.type === 'fixTranscript' && t.status === 'succeeded'
  );
  const hasHumanReview = meetingRecord.taskStatuses.some(
    t => t.type === 'humanReview' && t.status === 'succeeded'
  );

  if (!hasFixTranscript) {
    return null;
  }

  // Determine status
  const status = determineReviewStatus(
    hasFixTranscript,
    hasHumanReview,
    stats.reviewedUtterances
  );

  // Calculate review duration
  const reviewDurationMs = stats.lastEditAt && meetingRecord.dateTime
    ? stats.lastEditAt.getTime() - meetingRecord.dateTime.getTime()
    : null;

  // Load utterances with edits ONLY for session calculation
  const utterancesForSessions = await prisma.utterance.findMany({
    where: whereClause.utterancesByMeeting(meetingId),
    include: includePattern.utterancesForSessions(),
    orderBy: { startTimestamp: 'asc' }
  });

  // Calculate sessions
  const sessionData = calculateSessionData(
    utterancesForSessions,
    stats.reviewers,
    stats.primaryReviewer?.userId ?? null,
    stats.meetingDurationMs
  );

  return {
    // Base meeting info
    meetingId: meetingRecord.id,
    cityId: meetingRecord.cityId,
    cityName: meetingRecord.city.name,
    meetingName: meetingRecord.name,
    meetingDate: meetingRecord.dateTime,
    status,
    // Aggregated stats (all ReviewListItem fields)
    totalUtterances: stats.totalUtterances,
    reviewedUtterances: stats.reviewedUtterances,
    userEditedUtterances: stats.userEditedUtterances,
    taskEditedUtterances: stats.taskEditedUtterances,
    progressPercentage: stats.progressPercentage,
    reviewers: stats.reviewers,
    primaryReviewer: stats.primaryReviewer,
    firstEditAt: stats.firstEditAt,
    lastEditAt: stats.lastEditAt,
    meetingDurationMs: stats.meetingDurationMs,
    reviewDurationMs,
    // Session data
    ...sessionData,
  };
}

/**
 * Get list of all reviewers who have worked on transcripts
 * Returns unique list of users who have made edits
 */
export async function getReviewers(): Promise<Array<{ id: string; name: string | null; email: string }>> {
  const users = await prisma.user.findMany({
    where: {
      utteranceEdits: {
        some: {
          editedBy: 'user'
        }
      }
    },
    select: {
      id: true,
      name: true,
      email: true
    },
    orderBy: {
      name: 'asc'
    }
  });

  return users;
}

/**
 * Get review stats for a meeting based on the actual reviewers (not current user)
 * Returns stats for the primary reviewer and lists all other reviewers
 * Used when marking a review as complete to show the actual work done
 */
export async function getMeetingReviewStats(meetingId: MeetingId) {
  // Use the existing calculateReviewProgress which already identifies reviewers
  const progress = await getReviewProgressForMeeting(meetingId);
  
  if (!progress) {
    throw new Error('Meeting not found');
  }

  if (!progress.primaryReviewer) {
    return {
      hasReviewers: false,
      primaryReviewer: null,
      secondaryReviewers: [],
      editCount: 0,
      estimatedReviewTimeMs: 0,
      unifiedReviewSessions: [],
      totalReviewTimeMs: 0,
      totalReviewEfficiency: 0,
      meetingDurationMs: progress.meetingDurationMs,
      reviewEfficiency: 0,
    };
  }

  // Get secondary reviewers (everyone except primary)
  const secondaryReviewers = progress.reviewers.filter(
    r => r.userId !== progress.primaryReviewer?.userId
  );

  return {
    hasReviewers: true,
    primaryReviewer: progress.primaryReviewer,
    secondaryReviewers,
    editCount: progress.primaryReviewer.editCount,
    totalUtterances: progress.totalUtterances,
    estimatedReviewTimeMs: progress.estimatedReviewTimeMs,
    unifiedReviewSessions: progress.unifiedReviewSessions,
    totalReviewTimeMs: progress.totalReviewTimeMs,
    totalReviewEfficiency: progress.totalReviewEfficiency || 0,
    meetingDurationMs: progress.meetingDurationMs,
    reviewEfficiency: progress.reviewEfficiency || 0,
  };
}


