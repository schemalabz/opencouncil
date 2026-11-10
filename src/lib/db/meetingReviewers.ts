import 'server-only';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';

export const reviewerUserSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

export type ReviewerUser = Prisma.UserGetPayload<{ select: typeof reviewerUserSelect }>;

type MeetingId = {
  cityId: string;
  meetingId: string;
};

export class InvalidReviewerError extends Error {
  constructor() {
    super('The reviewer must be an existing superadmin');
    this.name = 'InvalidReviewerError';
  }
}

/** Every superadmin, the people who can own a review. */
export async function getSuperAdmins(): Promise<ReviewerUser[]> {
  return prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: reviewerUserSelect,
    orderBy: { name: 'asc' },
  });
}

/**
 * Assign the review of a meeting to a superadmin, or clear it with null.
 * Throws InvalidReviewerError when the target user is not a superadmin.
 */
export async function setMeetingReviewer(
  { cityId, meetingId }: MeetingId,
  userId: string | null
): Promise<ReviewerUser | null> {
  if (userId === null) {
    await prisma.meetingReviewer.deleteMany({
      where: { meetingCityId: cityId, meetingId },
    });
    return null;
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...reviewerUserSelect, isSuperAdmin: true },
  });
  if (!target?.isSuperAdmin) {
    throw new InvalidReviewerError();
  }

  await prisma.meetingReviewer.upsert({
    where: { meetingCityId_meetingId: { meetingCityId: cityId, meetingId } },
    create: { meetingCityId: cityId, meetingId, userId },
    update: { userId },
  });

  const { isSuperAdmin: _, ...reviewer } = target;
  return reviewer;
}
