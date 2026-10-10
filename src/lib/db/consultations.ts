import { Consultation, User, ConsultationComment, ConsultationCommentEntityType, Realm } from '@prisma/client';
import { Session } from 'next-auth';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { sendMagicLink } from "@/lib/auth/magicLink";
import { plainTextToCommentHtml } from "@/lib/utils/commentText";
import {
    COMMENT_MAX_LENGTH,
    createPendingConsultationComment,
    fetchRegulationData,
    publishConsultationComment,
    regulationHasEntity,
} from "./consultationComments";
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export { fetchRegulationData };

// Re-export the enum for use in other files
export { ConsultationCommentEntityType };

// ----- Admin types -----

export type ConsultationForAdmin = Consultation & {
    city: Pick<import('@prisma/client').City, 'id' | 'name'>;
    _count: { comments: number };
};

// ----- Admin CRUD functions -----

export async function getConsultationsForAdmin(): Promise<ConsultationForAdmin[]> {
    await withUserAuthorizedToEdit({});
    return prisma.consultation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            city: { select: { id: true, name: true } },
            _count: { select: { comments: true } }
        }
    });
}

export async function createConsultation(data: {
    name: string;
    jsonUrl: string;
    endDate: string;
    isActive?: boolean;
    cityId: string;
}) {
    await withUserAuthorizedToEdit({});
    // Validate the city exists and has consultations enabled
    const city = await prisma.city.findUnique({
        where: { id: data.cityId },
        select: { id: true, consultationsEnabled: true }
    });

    if (!city) {
        throw new Error('City not found');
    }

    if (!city.consultationsEnabled) {
        throw new Error('Consultations are not enabled for this city. Enable them first in city settings.');
    }

    return prisma.consultation.create({
        data: {
            name: data.name,
            jsonUrl: data.jsonUrl,
            endDate: new Date(data.endDate),
            isActive: data.isActive ?? true,
            cityId: data.cityId
        },
        include: {
            city: { select: { id: true, name: true } }
        }
    });
}

export async function updateConsultation(
    id: string,
    data: { name?: string; jsonUrl?: string; endDate?: string; isActive?: boolean }
) {
    await withUserAuthorizedToEdit({});
    return prisma.consultation.update({
        where: { id },
        data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.jsonUrl !== undefined && { jsonUrl: data.jsonUrl }),
            ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        include: {
            city: { select: { id: true, name: true } }
        }
    });
}

export async function deleteConsultation(id: string) {
    await withUserAuthorizedToEdit({});
    return prisma.consultation.delete({ where: { id } });
}

export async function getAdminCityOptions() {
    await withUserAuthorizedToEdit({});
    return prisma.city.findMany({
        where: { consultationsEnabled: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}

// Types for comment data with upvote information
export interface ConsultationCommentWithUpvotes extends ConsultationComment {
    user: Pick<User, 'id' | 'name'>;
    upvoteCount: number;
    hasUserUpvoted: boolean;
}

export type ConsultationWithStatus = Consultation & {
    isActiveComputed: boolean;
    city: {
        timezone: string;
        realm: Realm;
    };
}

// Type for consultations that include city timezone
export type ConsultationWithCity = Consultation & {
    city: {
        timezone: string;
    };
}

export interface RegulationEntity {
    id: string;
    name?: string;
    title?: string;
}

// Helper function to check if a consultation is truly active
export function isConsultationActive(consultation: Consultation, cityTimezone: string): boolean {
    if (!consultation.isActive) {
        return false;
    }

    // The consultation.endDate from database should be interpreted as city timezone, but JavaScript treats it as UTC
    // We need to extract the time components and treat them as if they're in the city timezone

    // Use UTC methods to get the "raw" time components from the database
    const endDate = consultation.endDate;
    const year = endDate.getUTCFullYear();
    const month = String(endDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(endDate.getUTCDate()).padStart(2, '0');
    const hours = String(endDate.getUTCHours()).padStart(2, '0');
    const minutes = String(endDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(endDate.getUTCSeconds()).padStart(2, '0');

    const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    // Now treat this as city timezone and convert to proper UTC
    const correctDate = fromZonedTime(dateTimeString, cityTimezone);

    // Compare with current UTC time
    const now = new Date();

    return correctDate > now;
}

export async function getConsultationsForCity(cityId: string): Promise<ConsultationWithCity[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId,
            isActive: true, // Keep filtering for active flag - can show ended consultations that are still flagged as active
        },
        include: {
            city: {
                select: {
                    timezone: true
                }
            }
        },
        orderBy: [
            {
                endDate: 'desc' // Show most recent first
            }
        ]
    });
}

export async function getConsultationById(cityId: string, consultationId: string): Promise<ConsultationWithStatus | null> {
    const consultation = await prisma.consultation.findFirst({
        where: {
            id: consultationId,
            cityId,
        },
        include: {
            city: {
                select: {
                    timezone: true,
                    realm: true
                }
            }
        }
    });
    if (!consultation) {
        return null;
    }

    return {
        ...consultation,
        isActiveComputed: isConsultationActive(consultation, consultation.city.timezone)
    };
}

// Optimized function for OG image generation
export async function getConsultationDataForOG(cityId: string, consultationId: string) {
    return await prisma.consultation.findFirst({
        where: {
            id: consultationId,
            cityId,
            isActive: true
        },
        include: {
            city: {
                // `name_municipality_en` comes along because the OG image renders
                // in the locale of the page that embeds it, English included.
                select: {
                    id: true,
                    name: true,
                    name_en: true,
                    name_municipality: true,
                    name_municipality_en: true,
                    logoImage: true,
                    authorityType: true,
                }
            },
            _count: {
                select: {
                    comments: true
                }
            }
        }
    });
}

export async function getAllConsultationsForCity(cityId: string): Promise<ConsultationWithCity[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId
        },
        include: {
            city: {
                select: {
                    timezone: true
                }
            }
        },
        orderBy: {
            endDate: 'desc'
        }
    });
}

// Get all comments for a consultation with upvote information
export async function getConsultationComments(
    consultationId: string,
    cityId: string,
    session?: Session | null
): Promise<ConsultationCommentWithUpvotes[]> {
    const comments = await prisma.consultationComment.findMany({
        where: {
            consultationId,
            cityId
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true
                }
            },
            upvotes: {
                select: {
                    userId: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    const result = comments.map(comment => {
        const hasUserUpvoted = session?.user?.id ? comment.upvotes.some(upvote => upvote.userId === session.user.id) : false;
        // console.log(`Comment ${comment.id}: userId=${session?.user?.id}, upvotes=[${comment.upvotes.map(u => u.userId).join(',')}], hasUserUpvoted=${hasUserUpvoted}`);

        return {
            ...comment,
            upvoteCount: comment.upvotes.length,
            hasUserUpvoted
        };
    });

    return result;
}

// Get comments for a specific entity
export async function getCommentsForEntity(
    consultationId: string,
    cityId: string,
    entityType: ConsultationCommentEntityType,
    entityId: string,
    session?: Session | null
): Promise<ConsultationCommentWithUpvotes[]> {
    const comments = await prisma.consultationComment.findMany({
        where: {
            consultationId,
            cityId,
            entityType,
            entityId
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true
                }
            },
            upvotes: {
                select: {
                    userId: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return comments.map(comment => ({
        ...comment,
        upvoteCount: comment.upvotes.length,
        hasUserUpvoted: session?.user?.id ? comment.upvotes.some(upvote => upvote.userId === session.user.id) : false
    }));
}

// Add a new comment (with server-side validation and auth)
/** Checks a comment against its consultation and regulation, and renders its plain text. */
async function prepareComment(consultationId: string, cityId: string, entityType: ConsultationCommentEntityType, entityId: string, text: string) {
    const consultation = await getConsultationById(cityId, consultationId);
    if (!consultation) {
        throw new Error('Consultation not found');
    }
    if (!consultation.isActiveComputed) {
        throw new Error('This consultation is no longer accepting comments');
    }

    const regulationData = await fetchRegulationData(consultation.jsonUrl);
    if (!regulationData) {
        throw new Error('Could not fetch regulation data');
    }
    if (!regulationHasEntity(regulationData, entityType, entityId)) {
        throw new Error(`Entity ${entityType}:${entityId} not found in regulation`);
    }

    if (!text.trim()) {
        throw new Error('Comment body cannot be empty');
    }
    if (text.length > COMMENT_MAX_LENGTH) {
        throw new Error(`Comment body too long (max ${COMMENT_MAX_LENGTH} characters)`);
    }

    return { consultation, regulationData, bodyHtml: plainTextToCommentHtml(text) };
}

/** A signed-in reader's comment: published at once. `text` is plain text. */
export async function addConsultationComment(
    consultationId: string,
    cityId: string,
    session: Session | null,
    entityType: ConsultationCommentEntityType,
    entityId: string,
    text: string
): Promise<ConsultationComment | null> {
    if (!session?.user?.id) {
        throw new Error('Authentication required');
    }
    const { consultation, regulationData, bodyHtml } = await prepareComment(consultationId, cityId, entityType, entityId, text);
    return publishConsultationComment({
        consultation,
        regulationData,
        userId: session.user.id,
        entityType,
        entityId,
        bodyHtml,
        notify: true
    });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 100;

/**
 * A comment from a reader who is not signed in. It waits, hidden, until they open the confirmation
 * link sent to `email`; the page that link lands on publishes it (confirmPendingConsultationComment). The account
 * is found or created by email, the way the notifications signup does it; the typed name goes on
 * the account only at publication. Returns whether the email went out.
 */
export async function submitPendingConsultationComment(data: {
    consultationId: string;
    cityId: string;
    entityType: ConsultationCommentEntityType;
    entityId: string;
    text: string;
    name: string;
    email: string;
}): Promise<{ emailSent: boolean }> {
    const email = data.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
        throw new Error('A valid email is required');
    }
    const name = data.name.trim();
    if (name.length > NAME_MAX_LENGTH) {
        throw new Error(`Name too long (max ${NAME_MAX_LENGTH} characters)`);
    }

    const { consultation, bodyHtml } = await prepareComment(data.consultationId, data.cityId, data.entityType, data.entityId, data.text);

    // An upsert, so two submissions at once for a new address create one account, not an error.
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email }, select: { id: true } });

    const pending = await createPendingConsultationComment({
        userId: user.id,
        consultationId: consultation.id,
        cityId: consultation.cityId,
        entityType: data.entityType,
        entityId: data.entityId,
        bodyHtml,
        authorName: name || null
    });

    // `pending` names the comment the link publishes (the page confirms it on arrival), and tells the
    // auth email to ask for a confirmation, quoting the comment, rather than a sign-in.
    const returnTo = `/${consultation.cityId}/consultation/${consultation.id}?view=comment&entity=${encodeURIComponent(data.entityId)}&pending=${encodeURIComponent(pending.id)}`;
    const emailSent = await sendMagicLink(email, returnTo);
    // Without the email nothing can confirm the comment: drop it, and the reader sends the form again.
    if (!emailSent) await prisma.pendingConsultationComment.deleteMany({ where: { id: pending.id } });
    return { emailSent };
}

// Toggle upvote on a comment (with auth)
export async function toggleCommentUpvote(
    commentId: string,
    session: Session | null
): Promise<{ upvoted: boolean; upvoteCount: number }> {
    // Check authentication
    if (!session?.user?.id) {
        throw new Error('Authentication required');
    }

    const userId = session.user.id;
    // Check if user has already upvoted this comment
    const existingUpvote = await prisma.consultationCommentUpvote.findUnique({
        where: {
            userId_commentId: {
                userId,
                commentId
            }
        }
    });

    if (existingUpvote) {
        // Remove upvote
        await prisma.consultationCommentUpvote.delete({
            where: {
                id: existingUpvote.id
            }
        });
    } else {
        // Add upvote
        await prisma.consultationCommentUpvote.create({
            data: {
                userId,
                commentId
            }
        });
    }

    // Get updated upvote count
    const upvoteCount = await prisma.consultationCommentUpvote.count({
        where: {
            commentId
        }
    });

    return {
        upvoted: !existingUpvote,
        upvoteCount
    };
}

// Delete a comment (with auth and ownership check)
export async function deleteConsultationComment(
    commentId: string,
    session: Session | null
): Promise<void> {
    // Check authentication
    if (!session?.user?.id) {
        throw new Error('Authentication required');
    }

    // Get the comment to check ownership
    const comment = await prisma.consultationComment.findUnique({
        where: {
            id: commentId
        },
        select: {
            id: true,
            userId: true
        }
    });

    if (!comment) {
        throw new Error('Comment not found');
    }

    // Check if user owns the comment
    if (comment.userId !== session.user.id) {
        throw new Error('You can only delete your own comments');
    }

    // Delete the comment (upvotes will be cascade deleted)
    await prisma.consultationComment.delete({
        where: {
            id: commentId
        }
    });
}