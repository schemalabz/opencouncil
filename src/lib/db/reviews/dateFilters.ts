import { Prisma } from '@prisma/client';

/**
 * Build date filter for last 30 days or all past meetings
 */
export function buildDateFilter(last30Days: boolean): Prisma.CouncilMeetingWhereInput {
  const now = new Date();
  
  if (last30Days) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      dateTime: {
        gte: thirtyDaysAgo,
        lte: now
      }
    };
  }
  
  return {
    dateTime: {
      lte: now
    }
  };
}

