import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { calculateMeetingDurationMs } from '@/lib/db/utils/meetingDuration';
import { startOfWeek, subWeeks, format } from 'date-fns';

interface WeekData {
  week: string;
  reviewed: number;
  needsReview: number;
}

export async function GET() {
  // Check authentication - admin routes require authorization
  await withUserAuthorizedToEdit({});
  
  try {
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const twelveWeeksAgo = subWeeks(currentWeekStart, 11); // 12 weeks including current week

    // Get all meetings from the past 12 weeks with their task statuses and duration
    const meetings = await prisma.councilMeeting.findMany({
      where: {
        dateTime: {
          gte: twelveWeeksAgo
        }
      },
      include: {
        taskStatuses: {
          where: {
            type: { in: ['transcribe', 'fixTranscript', 'humanReview'] },
            status: 'succeeded'
          }
        },
        speakerSegments: {
          include: {
            utterances: {
              select: {
                startTimestamp: true,
                endTimestamp: true
              }
            }
          }
        }
      }
    });

    // Calculate meeting duration and categorize
    const meetingsByWeek = new Map<string, { reviewed: number; needsReview: number }>();

    // Initialize all 12 weeks with zero values
    for (let i = 0; i < 12; i++) {
      const weekStart = subWeeks(currentWeekStart, 11 - i);
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      meetingsByWeek.set(weekKey, { reviewed: 0, needsReview: 0 });
    }

    for (const meeting of meetings) {
      // Calculate meeting duration from utterances using shared utility
      const meetingDurationMs = calculateMeetingDurationMs(meeting);

      if (meetingDurationMs === 0) {
        continue; // Skip meetings without duration
      }

      // Determine week
      const meetingWeekStart = startOfWeek(meeting.dateTime, { weekStartsOn: 1 });
      const weekKey = format(meetingWeekStart, 'yyyy-MM-dd');

      // Skip if outside our 12-week range
      if (!meetingsByWeek.has(weekKey)) {
        continue;
      }

      // Check task statuses
      const hasTranscribe = meeting.taskStatuses.some(
        t => t.type === 'transcribe' && t.status === 'succeeded'
      );
      const hasHumanReview = meeting.taskStatuses.some(
        t => t.type === 'humanReview' && t.status === 'succeeded'
      );

      // Categorize: reviewed = has humanReview, needsReview = has transcribe but no humanReview
      if (hasHumanReview) {
        const weekData = meetingsByWeek.get(weekKey)!;
        weekData.reviewed += meetingDurationMs;
      } else if (hasTranscribe) {
        const weekData = meetingsByWeek.get(weekKey)!;
        weekData.needsReview += meetingDurationMs;
      }
    }

    // Convert to array format
    const result: WeekData[] = Array.from(meetingsByWeek.entries())
      .map(([week, data]) => ({
        week,
        reviewed: data.reviewed,
        needsReview: data.needsReview
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching volume chart data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch volume chart data' },
      { status: 500 }
    );
  }
}

