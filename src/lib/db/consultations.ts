import { Consultation, User, ConsultationComment, ConsultationCommentEntityType } from '@prisma/client';
import { Session } from 'next-auth';
import prisma from "./prisma";
import { sendConsultationCommentEmail } from "../email/consultation";
import { RegulationData } from "@/components/consultations/types";

// Re-export the enum for use in other files
export { ConsultationCommentEntityType };

// Types for comment data with upvote information
export interface ConsultationCommentWithUpvotes extends ConsultationComment {
    user: Pick<User, 'id' | 'name'>;
    upvoteCount: number;
    hasUserUpvoted: boolean;
}

export type ConsultationWithStatus = Consultation & {
    isActiveComputed: boolean;
}

export interface RegulationEntity {
    id: string;
    name?: string;
    title?: string;
}

// Helper function to check if a consultation is truly active
export function isConsultationActive(consultation: Consultation): boolean {
    return consultation.isActive && new Date(consultation.endDate) > new Date();
}

export async function getConsultationsForCity(cityId: string): Promise<Consultation[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId,
            isActive: true, // Keep filtering for active flag - can show ended consultations that are still flagged as active
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
            isActive: true
        }
    });

    if (!consultation) {
        return null;
    }

    return {
        ...consultation,
        isActiveComputed: isConsultationActive(consultation)
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
                select: {
                    id: true,
                    name: true,
                    name_municipality: true,
                    logoImage: true,
                    authorityType: true,
                    officialSupport: true,
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

export async function getAllConsultationsForCity(cityId: string): Promise<Consultation[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId
        },
        orderBy: {
            endDate: 'desc'
        }
    });
}

// Helper function to validate that an entity exists in the regulation data
async function validateEntityExists(
    regulationData: RegulationData,
    entityType: ConsultationCommentEntityType,
    entityId: string
): Promise<boolean> {
    if (!regulationData?.regulation) {
        return false;
    }

    switch (entityType) {
        case ConsultationCommentEntityType.CHAPTER:
            return regulationData.regulation
                .filter(item => item.type === 'chapter')
                .some(chapter => chapter.id === entityId);

        case ConsultationCommentEntityType.ARTICLE:
            return regulationData.regulation
                .filter(item => item.type === 'chapter')
                .some(chapter =>
                    chapter.articles?.some(article => article.id === entityId)
                );

        case ConsultationCommentEntityType.GEOSET:
            return regulationData.regulation
                .filter(item => item.type === 'geoset')
                .some(geoset => geoset.id === entityId);

        case ConsultationCommentEntityType.GEOMETRY:
            return regulationData.regulation
                .filter(item => item.type === 'geoset')
                .some(geoset =>
                    geoset.geometries?.some(geometry => geometry.id === entityId)
                );

        default:
            return false;
    }
}

// Helper function to fetch regulation data from URL
async function fetchRegulationData(jsonUrl: string): Promise<RegulationData | null> {
    try {
        // Handle relative URLs by prepending the base URL
        const url = jsonUrl.startsWith('http') ? jsonUrl : jsonUrl;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            console.error(`Failed to fetch regulation data: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching regulation data:', error);
        return null;
    }
}

// Helper function to get entity details for email
function getEntityDetailsForEmail(
    regulationData: RegulationData,
    entityType: ConsultationCommentEntityType,
    entityId: string
): { entityTitle: string; entityNumber?: string; entityTypeForEmail: 'chapter' | 'article' | 'geoset' | 'geometry'; parentGeosetName?: string } | null {
    if (!regulationData?.regulation) {
        return null;
    }

    switch (entityType) {
        case ConsultationCommentEntityType.CHAPTER: {
            const chapter = regulationData.regulation
                .filter(item => item.type === 'chapter')
                .find(chapter => chapter.id === entityId);
            return chapter ? {
                entityTitle: chapter.title || 'Unnamed Chapter',
                entityNumber: chapter.num?.toString(),
                entityTypeForEmail: 'chapter'
            } : null;
        }

        case ConsultationCommentEntityType.ARTICLE: {
            for (const chapter of regulationData.regulation.filter(item => item.type === 'chapter')) {
                const article = chapter.articles?.find(article => article.id === entityId);
                if (article) {
                    return {
                        entityTitle: article.title || 'Unnamed Article',
                        entityNumber: article.num?.toString(),
                        entityTypeForEmail: 'article'
                    };
                }
            }
            return null;
        }

        case ConsultationCommentEntityType.GEOSET: {
            const geoset = regulationData.regulation
                .filter(item => item.type === 'geoset')
                .find(geoset => geoset.id === entityId);
            return geoset ? {
                entityTitle: geoset.name || 'Unnamed Area Set',
                entityTypeForEmail: 'geoset'
            } : null;
        }

        case ConsultationCommentEntityType.GEOMETRY: {
            for (const geoset of regulationData.regulation.filter(item => item.type === 'geoset')) {
                const geometry = geoset.geometries?.find(geometry => geometry.id === entityId);
                if (geometry) {
                    return {
                        entityTitle: geometry.name || 'Unnamed Area',
                        entityTypeForEmail: 'geometry',
                        parentGeosetName: geoset.name || 'Unnamed Geoset'
                    };
                }
            }
            return null;
        }

        default:
            return null;
    }
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
export async function addConsultationComment(
    consultationId: string,
    cityId: string,
    session: Session | null,
    entityType: ConsultationCommentEntityType,
    entityId: string,
    body: string
): Promise<ConsultationComment | null> {
    // Check authentication
    if (!session?.user?.id) {
        throw new Error('Authentication required');
    }

    // First, get the consultation to access the regulation data
    const consultation = await getConsultationById(cityId, consultationId);
    if (!consultation) {
        throw new Error('Consultation not found');
    }

    // Check if consultation is active (both flag and date)
    if (!consultation.isActiveComputed) {
        throw new Error('This consultation is no longer accepting comments');
    }

    // Fetch and validate the regulation data
    const regulationData = await fetchRegulationData(consultation.jsonUrl);
    if (!regulationData) {
        throw new Error('Could not fetch regulation data');
    }

    // console.log('Regulation data structure:', JSON.stringify(regulationData, null, 2));
    // console.log('Validating entity:', entityType, entityId);

    // Validate that the entity exists in the regulation
    const entityExists = await validateEntityExists(regulationData, entityType, entityId);
    if (!entityExists) {
        throw new Error(`Entity ${entityType}:${entityId} not found in regulation`);
    }

    // Validate body content
    if (!body.trim()) {
        throw new Error('Comment body cannot be empty');
    }

    if (body.length > 5000) {
        throw new Error('Comment body too long (max 5000 characters)');
    }

    // Get user details for the email
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true }
    });

    if (!user?.email) {
        throw new Error('User email not found');
    }

    // Create the comment
    const comment = await prisma.consultationComment.create({
        data: {
            body: body.trim(),
            entityType,
            entityId,
            userId: session.user.id,
            consultationId,
            cityId
        }
    });

    // Only send email notification if consultation is still active
    if (consultation.isActiveComputed) {
        try {
            // Get entity details for the email
            const entityDetails = getEntityDetailsForEmail(regulationData, entityType, entityId);

            if (entityDetails && regulationData.contactEmail) {
                const consultationUrl = `/${consultation.cityId}/consultation/${consultationId}`;

                await sendConsultationCommentEmail({
                    userName: user.name || 'Unknown User',
                    userEmail: user.email,
                    consultationTitle: regulationData.title || 'Consultation',
                    entityType: entityDetails.entityTypeForEmail,
                    entityId: entityId,
                    entityTitle: entityDetails.entityTitle,
                    entityNumber: entityDetails.entityNumber,
                    parentGeosetName: entityDetails.parentGeosetName,
                    commentBody: body.trim(),
                    consultationUrl,
                    municipalityEmail: regulationData.contactEmail,
                    ccEmails: regulationData.ccEmails
                });
            }
        } catch (emailError) {
            // Log email error but don't fail the comment creation
            console.error('Failed to send comment notification email:', emailError);
        }
    }

    return comment;
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