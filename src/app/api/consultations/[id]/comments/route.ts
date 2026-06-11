import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
    getConsultationComments,
    addConsultationComment,
    ConsultationCommentEntityType,
    getConsultationById
} from '@/lib/db/consultations';
import { getPostHogClient } from '@/lib/posthog-server';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await auth();
        const { searchParams } = new URL(request.url);
        const cityId = searchParams.get('cityId');

        if (!cityId) {
            return NextResponse.json(
                { error: 'City ID is required' },
                { status: 400 }
            );
        }

        const comments = await getConsultationComments(
            params.id,
            cityId,
            session
        );

        return NextResponse.json({ comments });
    } catch (error) {
        console.error('Error fetching comments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch comments' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await auth();
        const body = await request.json();
        const { cityId, entityType, entityId, body: commentBody } = body;

        // Validate required fields
        if (!cityId || !entityType || !entityId || !commentBody) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate entity type
        if (!Object.values(ConsultationCommentEntityType).includes(entityType)) {
            return NextResponse.json(
                { error: 'Invalid entity type' },
                { status: 400 }
            );
        }

        // Check if consultation exists and is active
        const consultation = await getConsultationById(cityId, params.id);
        if (!consultation) {
            return NextResponse.json(
                { error: 'Consultation not found' },
                { status: 404 }
            );
        }

        if (!consultation.isActiveComputed) {
            return NextResponse.json(
                { error: 'This consultation is no longer accepting comments' },
                { status: 403 }
            );
        }

        const comment = await addConsultationComment(
            params.id,
            cityId,
            session,
            entityType,
            entityId,
            commentBody
        );

        // Only attribute the event when there's a signed-in user; a shared
        // "anonymous" distinct ID would pile unrelated events onto one person.
        if (session?.user?.id) {
            getPostHogClient()?.capture({
                distinctId: session.user.id,
                event: "consultation_comment_submitted",
                properties: {
                    consultation_id: params.id,
                    city_id: cityId,
                    entity_type: entityType,
                },
            });
        }

        return NextResponse.json({ comment });
    } catch (error) {
        console.error('Error adding comment:', error);

        if (error instanceof Error) {
            return NextResponse.json(
                { error: error.message },
                { status: error.message === 'Authentication required' ? 401 : 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to add comment' },
            { status: 500 }
        );
    }
} 