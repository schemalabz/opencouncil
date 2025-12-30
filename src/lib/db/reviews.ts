'use server'
import { Prisma } from '@prisma/client';
import prisma from './prisma';

const reviewProgressInclude = {
  city: {
    select: {
      name: true,
    }
  },
  taskStatuses: {
    where: {
      type: {
        in: ['fixTranscript', 'humanReview']
      },
      status: 'succeeded'
    },
    orderBy: {
      createdAt: 'desc'
    }
  },
  speakerSegments: {
    include: {
      utterances: {
        include: {
          utteranceEdits: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        },
        orderBy: {
          startTimestamp: 'asc'
        }
      }
    },
    orderBy: {
      startTimestamp: 'asc'
    }
  }
} satisfies Prisma.CouncilMeetingInclude;

// Derive type from the include pattern
type MeetingWithReviewData = Prisma.CouncilMeetingGetPayload<{
  include: typeof reviewProgressInclude;
}>;

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
 * Derived from Prisma's generated types based on our include pattern
 */
export type UtteranceWithEdits = MeetingWithReviewData['speakerSegments'][0]['utterances'][0];

// ============================================================================
// EXPORTED INTERFACES
// ============================================================================

export type ReviewStatus = 'needsReview' | 'inProgress' | 'completed';

export interface ReviewProgress {
  meetingId: string;
  cityId: string;
  cityName: string;
  meetingName: string;
  meetingNameEn: string;
  meetingDate: Date;
  status: ReviewStatus;
  
  // Utterance counts
  totalUtterances: number;
  reviewedUtterances: number; // Based on sequential progress (last user edit timestamp)
  userEditedUtterances: number; // Actually edited by users
  taskEditedUtterances: number; // Automatically fixed by fixTranscript
  
  // Progress
  progressPercentage: number;
  
  // Reviewers
  reviewers: ReviewerInfo[];
  primaryReviewer: ReviewerInfo | null;
  
  // Timestamps
  firstEditAt: Date | null;
  lastEditAt: Date | null;
  lastReviewedUtteranceTimestamp: number | null; // Timestamp of last user-edited utterance
  
  // Review time estimation
  estimatedReviewTimeMs: number; // Estimated time spent reviewing (excluding breaks)
  reviewSessions: number; // Number of distinct review sessions
  reviewSessionsDetail: ReviewSession[]; // Detailed breakdown of each review session (primary reviewer only)
  unifiedReviewSessions: UnifiedReviewSession[]; // All reviewers' sessions merged chronologically
  
  // Meeting duration (derived from utterances)
  meetingDurationMs: number; // Total duration of the meeting content
  reviewEfficiency: number | null; // Ratio of review time to meeting duration (e.g., 1.5 = 1.5:1 ratio)
}

export interface ReviewStats {
  needsReview: number;
  inProgress: number;
  completedToday: number;
  completedThisWeek: number;
}

/**
 * Aggregated statistics from a list of reviews
 */
export interface ReviewAggregates {
  totalReviews: number;
  totalUserEditedUtterances: number;
  totalReviewTimeMs: number;
  averageEfficiency: number | null;
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
 * Filter edits to only include task-made edits
 */
function isTaskEdit(edit: UtteranceWithEdits['utteranceEdits'][0]): boolean {
  return edit.editedBy === 'task';
}

/**
 * Calculate the duration of an utterance in seconds
 */
function getUtteranceDurationSeconds(utterance: Pick<UtteranceWithEdits, 'startTimestamp' | 'endTimestamp'>): number {
  return utterance.endTimestamp - utterance.startTimestamp;
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
  totalUtteranceDurationSeconds: number;
  durationMs: number;
  meetingStartTimestamp: number; // Start timestamp of the earliest utterance edited in this session (in seconds)
  meetingEndTimestamp: number; // End timestamp of the latest utterance edited in this session (in seconds)
  reviewerId?: string; // Added to identify which reviewer worked this session
  reviewerName?: string | null;
  reviewerEmail?: string;
}

// Unified session across all reviewers
export interface UnifiedReviewSession extends ReviewSession {
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string;
  isPrimaryReviewer: boolean;
}

/**
 * Calculate estimated review time for a primary reviewer
 * 
 * Leverages the nested structure of utterances with their edits.
 * For utterances with multiple edits, uses the FIRST edit timestamp (initial review).
 * 
 * @param primaryReviewerId - User ID of the primary reviewer
 * @param allUtterances - All utterances in the meeting (already sorted by position with nested edits)
 * @returns Estimated review time in milliseconds and session breakdown
 */
function calculateReviewTime(
  reviewerId: string,
  allUtterances: UtteranceWithEdits[],
  includeReviewerInfo = false
): { totalTimeMs: number; sessions: ReviewSession[] } {
  // Find utterances edited by this reviewer and get their first edit timestamp
  interface EditedUtterance {
    utteranceIndex: number;
    utterance: typeof allUtterances[0];
    firstEditTime: Date;
    reviewerName: string | null;
    reviewerEmail: string;
  }
  
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
    const singleUtterance = editedUtterances[0].utterance;
    const session: ReviewSession = {
      startTime: editedUtterances[0].firstEditTime,
      endTime: editedUtterances[0].firstEditTime,
      utterancesCovered: 1,
      totalUtteranceDurationSeconds: 0,
      durationMs: singleEditTimeMs,
      meetingStartTimestamp: singleUtterance.startTimestamp,
      meetingEndTimestamp: singleUtterance.endTimestamp,
    };
    
    if (includeReviewerInfo) {
      session.reviewerId = reviewerId;
      session.reviewerName = editedUtterances[0].reviewerName;
      session.reviewerEmail = editedUtterances[0].reviewerEmail;
    }
    
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
    
    // For utterances between edits, we look at the POSITION difference
    // to understand how much content was potentially reviewed
    const positionDiff = Math.abs(currentEdited.utteranceIndex - prevEdited.utteranceIndex);
    
    // Get utterances in the range between these two positions
    const minPos = Math.min(prevEdited.utteranceIndex, currentEdited.utteranceIndex);
    const maxPos = Math.max(prevEdited.utteranceIndex, currentEdited.utteranceIndex);
    const utterancesBetween = allUtterances.slice(minPos + 1, maxPos + 1);
    
    // Calculate total audio duration of utterances between edits
    const totalUtteranceDurationSeconds = utterancesBetween.reduce(
      (sum, u) => sum + getUtteranceDurationSeconds(u),
      0
    );
    
    // Expected review time = audio duration × speed multiplier
    const expectedReviewTimeMs = totalUtteranceDurationSeconds * 1000 * REVIEW_TIME_CONFIG.REVIEW_SPEED_MULTIPLIER;
    
    // Excess time = time beyond what we'd expect for reviewing the utterances
    const excessTimeMs = timeGapMs - expectedReviewTimeMs;
    const maxExcessMs = REVIEW_TIME_CONFIG.MAX_EXCESS_TIME_MINUTES * 60 * 1000;
    
    // If excess time is too large, end current session and start new one
    if (excessTimeMs >= maxExcessMs || timeGapMs < 0) {
      // Save the completed session
      const sessionEdits = editedUtterances.slice(sessionStartIdx, i);
      const sessionDurationMs = prevEdited.firstEditTime.getTime() - editedUtterances[sessionStartIdx].firstEditTime.getTime();
      const bufferMs = REVIEW_TIME_CONFIG.SESSION_BUFFER_MINUTES * 60 * 1000;
      
      // Count unique utterances in this session
      const sessionUtteranceIndices = new Set(sessionEdits.map(e => e.utteranceIndex));
      
      // Calculate total duration of utterances in session
      const sessionUtteranceDuration = sessionEdits.reduce(
        (sum, e) => sum + getUtteranceDurationSeconds(e.utterance),
        0
      );
      
      // Find the meeting timestamp range covered in this session
      const sessionUtterances = sessionEdits.map(e => e.utterance);
      const meetingStartTimestamp = Math.min(...sessionUtterances.map(u => u.startTimestamp));
      const meetingEndTimestamp = Math.max(...sessionUtterances.map(u => u.endTimestamp));
      
      const session: ReviewSession = {
        startTime: editedUtterances[sessionStartIdx].firstEditTime,
        endTime: prevEdited.firstEditTime,
        utterancesCovered: sessionUtteranceIndices.size,
        totalUtteranceDurationSeconds: sessionUtteranceDuration,
        durationMs: Math.max(0, sessionDurationMs) + bufferMs,
        meetingStartTimestamp,
        meetingEndTimestamp,
      };
      
      if (includeReviewerInfo) {
        session.reviewerId = reviewerId;
        session.reviewerName = editedUtterances[sessionStartIdx].reviewerName;
        session.reviewerEmail = editedUtterances[sessionStartIdx].reviewerEmail;
      }
      
      sessions.push(session);
      
      // Start new session
      sessionStartIdx = i;
    }
  }
  
  // Don't forget to add the last session
  const lastSessionEdits = editedUtterances.slice(sessionStartIdx);
  const lastSessionDurationMs = editedUtterances[editedUtterances.length - 1].firstEditTime.getTime() 
    - editedUtterances[sessionStartIdx].firstEditTime.getTime();
  const bufferMs = REVIEW_TIME_CONFIG.SESSION_BUFFER_MINUTES * 60 * 1000;
  
  // Count unique utterances in last session
  const lastSessionUtteranceIndices = new Set(lastSessionEdits.map(e => e.utteranceIndex));
  
  // Calculate total duration of utterances in last session
  const lastSessionUtteranceDuration = lastSessionEdits.reduce(
    (sum, e) => sum + getUtteranceDurationSeconds(e.utterance),
    0
  );
  
  // Find the meeting timestamp range covered in last session
  const lastSessionUtterances = lastSessionEdits.map(e => e.utterance);
  const lastMeetingStartTimestamp = Math.min(...lastSessionUtterances.map(u => u.startTimestamp));
  const lastMeetingEndTimestamp = Math.max(...lastSessionUtterances.map(u => u.endTimestamp));
  
  const lastSession: ReviewSession = {
    startTime: editedUtterances[sessionStartIdx].firstEditTime,
    endTime: editedUtterances[editedUtterances.length - 1].firstEditTime,
    utterancesCovered: lastSessionUtteranceIndices.size,
    totalUtteranceDurationSeconds: lastSessionUtteranceDuration,
    durationMs: Math.max(0, lastSessionDurationMs) + bufferMs,
    meetingStartTimestamp: lastMeetingStartTimestamp,
    meetingEndTimestamp: lastMeetingEndTimestamp,
  };
  
  if (includeReviewerInfo) {
    lastSession.reviewerId = reviewerId;
    lastSession.reviewerName = editedUtterances[sessionStartIdx].reviewerName;
    lastSession.reviewerEmail = editedUtterances[sessionStartIdx].reviewerEmail;
  }
  
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
    const { totalTimeMs, sessions } = calculateReviewTime(reviewer.userId, allUtterances, true);
    
    // Convert to UnifiedReviewSession with reviewer info
    for (const session of sessions) {
      allSessions.push({
        ...session,
        reviewerId: reviewer.userId,
        reviewerName: reviewer.userName,
        reviewerEmail: reviewer.userEmail,
        isPrimaryReviewer: reviewer.userId === primaryReviewerId,
      });
    }
  }
  
  // Sort all sessions chronologically
  allSessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  return allSessions;
}

/**
 * Process a single meeting and calculate its review progress
 * 
 * This function serves as the final filter/processor after database fetch.
 * It returns null for meetings that should be excluded based on their status.
 * 
 * @param meeting - Meeting data with task statuses and utterance edits
 * @param includeCompleted - Whether to include meetings with completed humanReview task
 *                           - true: Include completed reviews (for 'all' and 'completed' filters)
 *                           - false: Exclude completed reviews (for 'needsAttention' filter)
 * @returns ReviewProgress object or null if meeting should be excluded
 */
function calculateReviewProgress(meeting: MeetingWithReviewData, includeCompleted = false): ReviewProgress | null {
  const hasFixTranscript = meeting.taskStatuses.some(
    t => t.type === 'fixTranscript' && t.status === 'succeeded'
  );
  const hasHumanReview = meeting.taskStatuses.some(
    t => t.type === 'humanReview' && t.status === 'succeeded'
  );

  // Apply final filtering logic
  if (!hasFixTranscript) {
    // Never include meetings without fixTranscript
    return null;
  }
  
  if (!includeCompleted && hasHumanReview) {
    // When not including completed, skip meetings with humanReview done
    return null;
  }

  // Get all utterances sorted by timestamp
  const allUtterances = meeting.speakerSegments
    .flatMap(seg => seg.utterances)
    .sort((a, b) => a.startTimestamp - b.startTimestamp);
  
  const totalUtterances = allUtterances.length;
  
  // Separate user and task edits
  const allUserEdits = allUtterances.flatMap(u => 
    u.utteranceEdits.filter(isUserEdit)
  );
  const allTaskEdits = allUtterances.flatMap(u => 
    u.utteranceEdits.filter(isTaskEdit)
  );
  
  // Count unique utterances edited by users and tasks
  const userEditedUtteranceIds = new Set(allUserEdits.map(e => e.utteranceId));
  const taskEditedUtteranceIds = new Set(allTaskEdits.map(e => e.utteranceId));
  
  const userEditedUtterances = userEditedUtteranceIds.size;
  const taskEditedUtterances = taskEditedUtteranceIds.size;
  
  // Find the last utterance edited by a user (sequential progress)
  let lastReviewedUtteranceTimestamp: number | null = null;
  let reviewedUtterances = 0;
  
  if (allUserEdits.length > 0) {
    // Get the utterance IDs that have user edits
    const utterancesWithUserEdits = allUtterances.filter(u => 
      u.utteranceEdits.some(isUserEdit)
    );
    
    if (utterancesWithUserEdits.length > 0) {
      // Find the last one by timestamp
      const lastEditedUtterance = utterancesWithUserEdits[utterancesWithUserEdits.length - 1];
      lastReviewedUtteranceTimestamp = lastEditedUtterance.startTimestamp;
      
      // Count all utterances up to and including this timestamp as reviewed
      reviewedUtterances = allUtterances.filter(
        u => u.startTimestamp <= lastReviewedUtteranceTimestamp!
      ).length;
    }
  }
  
  // Group user edits by user
  const editsByUser = new Map<string, {
    userId: string;
    userName: string | null;
    userEmail: string;
    editCount: number;
  }>();
  
  for (const edit of allUserEdits) {
    if (edit.user) {
      const existing = editsByUser.get(edit.user.id);
      if (existing) {
        existing.editCount++;
      } else {
        editsByUser.set(edit.user.id, {
          userId: edit.user.id,
          userName: edit.user.name,
          userEmail: edit.user.email,
          editCount: 1,
        });
      }
    }
  }
  
  const reviewers = Array.from(editsByUser.values()).sort(
    (a, b) => b.editCount - a.editCount
  );
  
  const primaryReviewer = reviewers.length > 0 ? reviewers[0] : null;
  
  // Get first and last USER edit timestamps
  const userEditTimestamps = allUserEdits.map(e => e.createdAt);
  const firstEditAt = userEditTimestamps.length > 0
    ? new Date(Math.min(...userEditTimestamps.map(d => d.getTime())))
    : null;
  const lastEditAt = userEditTimestamps.length > 0
    ? new Date(Math.max(...userEditTimestamps.map(d => d.getTime())))
    : null;
  
  // Calculate review time for primary reviewer
  let estimatedReviewTimeMs = 0;
  let reviewSessions = 0;
  let reviewSessionsDetail: ReviewSession[] = [];
  
  if (primaryReviewer) {
    // Pass the primary reviewer ID and the full utterances structure
    // The function will leverage the nested edits directly
    const reviewTimeResult = calculateReviewTime(primaryReviewer.userId, allUtterances);
    estimatedReviewTimeMs = reviewTimeResult.totalTimeMs;
    reviewSessions = reviewTimeResult.sessions.length;
    reviewSessionsDetail = reviewTimeResult.sessions;
  }
  
  // Calculate unified review sessions across all reviewers
  const unifiedReviewSessions = calculateUnifiedReviewSessions(
    reviewers,
    primaryReviewer?.userId ?? null,
    allUtterances
  );
  
  // Calculate meeting duration from utterances
  // Duration = last utterance end time - first utterance start time
  let meetingDurationMs = 0;
  if (allUtterances.length > 0) {
    const firstUtterance = allUtterances[0];
    const lastUtterance = allUtterances[allUtterances.length - 1];
    const meetingDurationSeconds = getUtteranceDurationSeconds({
      startTimestamp: firstUtterance.startTimestamp,
      endTimestamp: lastUtterance.endTimestamp
    });
    meetingDurationMs = meetingDurationSeconds * 1000;
  }
  
  // Calculate review efficiency (ratio of review time to meeting duration)
  // Example: 0.5 means review took half as long as the meeting
  //          1.0 means review took same time as meeting
  //          2.0 means review took twice as long as meeting
  const reviewEfficiency = meetingDurationMs > 0 && estimatedReviewTimeMs > 0
    ? estimatedReviewTimeMs / meetingDurationMs
    : null;
  
  // Determine status based on review completion
  let status: ReviewStatus;
  if (hasHumanReview) {
    status = 'completed';
  } else if (reviewedUtterances === 0) {
    status = 'needsReview';
  } else {
    status = 'inProgress';
  }
  
  const progressPercentage = totalUtterances > 0
    ? Math.round((reviewedUtterances / totalUtterances) * 100)
    : 0;
  
  return {
    meetingId: meeting.id,
    cityId: meeting.cityId,
    cityName: meeting.city.name,
    meetingName: meeting.name,
    meetingNameEn: meeting.name_en,
    meetingDate: meeting.dateTime,
    status,
    totalUtterances,
    reviewedUtterances,
    userEditedUtterances,
    taskEditedUtterances,
    progressPercentage,
    reviewers,
    primaryReviewer,
    firstEditAt,
    lastEditAt,
    lastReviewedUtteranceTimestamp,
    estimatedReviewTimeMs,
    reviewSessions,
    reviewSessionsDetail,
    unifiedReviewSessions,
    meetingDurationMs,
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
 * Determine if completed reviews should be included based on filter
 */
function shouldIncludeCompleted(show: ReviewFilterOptions['show']): boolean {
  return show === 'all' || show === 'completed';
}

/**
 * Get meetings for review with optional filters
 */
export async function getMeetingsNeedingReview(filters: ReviewFilterOptions = {}): Promise<ReviewProgress[]> {
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
  
  // Fetch meetings from database
  const meetings = await prisma.councilMeeting.findMany({
    where: whereConditions,
    include: reviewProgressInclude,
    orderBy: {
      dateTime: 'desc'
    }
  });

  // Process meetings and apply final filtering
  const reviewProgressList: ReviewProgress[] = [];
  const includeCompleted = shouldIncludeCompleted(show);

  for (const meeting of meetings) {
    const progress = calculateReviewProgress(meeting, includeCompleted);
    
    if (!progress) continue;
    
    // If filtering by reviewer, verify they are the PRIMARY reviewer
    // (Database filter only ensures they made SOME edits)
    if (reviewerId && progress.primaryReviewer?.userId !== reviewerId) {
      continue;
    }
    
    reviewProgressList.push(progress);
  }

  return reviewProgressList;
}

/**
 * Get high-level review statistics
 */
export async function getReviewStats(): Promise<ReviewStats> {
  const reviewProgress = await getMeetingsNeedingReview();
  
  const needsReview = reviewProgress.filter(r => r.status === 'needsReview').length;
  const inProgress = reviewProgress.filter(r => r.status === 'inProgress').length;
  
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
 * Get detailed review progress for a specific meeting
 */
export async function getReviewProgressForMeeting(
  cityId: string,
  meetingId: string
): Promise<ReviewProgress | null> {
  const meeting = await prisma.councilMeeting.findUnique({
    where: {
      cityId_id: {
        cityId,
        id: meetingId
      }
    },
    include: reviewProgressInclude
  });

  if (!meeting) {
    return null;
  }

  return calculateReviewProgress(meeting, true); // Include completed for individual meeting view
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
export async function getMeetingReviewStats(cityId: string, meetingId: string) {
  // Use the existing calculateReviewProgress which already identifies reviewers
  const progress = await getReviewProgressForMeeting(cityId, meetingId);
  
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
    meetingDurationMs: progress.meetingDurationMs,
    reviewEfficiency: progress.reviewEfficiency || 0,
  };
}


