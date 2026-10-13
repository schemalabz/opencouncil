import type { Prisma } from '@prisma/client';

/** The municipality's response as the comment lists and the printout show it: no author, it speaks for the municipality. */
export const consultationCommentResponseSelect = {
    body: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.ConsultationCommentResponseSelect;

export type ConsultationCommentResponseView = Prisma.ConsultationCommentResponseGetPayload<{ select: typeof consultationCommentResponseSelect }>;
