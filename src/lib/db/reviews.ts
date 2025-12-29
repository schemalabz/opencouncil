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

export type ReviewStatus = 'needsReview' | 'inProgress';

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
}

export interface ReviewStats {
  needsReview: number;
  inProgress: number;
  completedToday: number;
  completedThisWeek: number;
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
 * Process a single meeting and calculate its review progress
 */
function calculateReviewProgress(meeting: MeetingWithReviewData): ReviewProgress | null {
  const hasFixTranscript = meeting.taskStatuses.some(
    t => t.type === 'fixTranscript' && t.status === 'succeeded'
  );
  const hasHumanReview = meeting.taskStatuses.some(
    t => t.type === 'humanReview' && t.status === 'succeeded'
  );

  // Only include meetings where fixTranscript is done but humanReview is not
  if (!hasFixTranscript || hasHumanReview) {
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
  
  // Determine status
  const status: ReviewStatus = reviewedUtterances === 0 ? 'needsReview' : 'inProgress';
  
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
  };
}

/**
 * Get all meetings that need review (fixTranscript done, humanReview not done)
 */
export async function getMeetingsNeedingReview(): Promise<ReviewProgress[]> {
  // Get all meetings with their task statuses
  const meetings = await prisma.councilMeeting.findMany({
    include: reviewProgressInclude,
    orderBy: {
      dateTime: 'desc'
    }
  });

  const reviewProgressList: ReviewProgress[] = [];

  for (const meeting of meetings) {
    const progress = calculateReviewProgress(meeting);
    if (progress) {
      reviewProgressList.push(progress);
    }
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

  return calculateReviewProgress(meeting);
}

