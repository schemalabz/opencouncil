import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { toggleCommentUpvote } from '@/lib/db/consultations';

export async function POST(
    request: NextRequest,
    { params }: { params: { commentId: string } }
) {
    try {
        const session = await auth();

        const result = await toggleCommentUpvote(
            params.commentId,
            session
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error toggling upvote:', error);

        if (error instanceof Error) {
            return NextResponse.json(
                { error: error.message },
                { status: error.message === 'Authentication required' ? 401 : 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to toggle upvote' },
            { status: 500 }
        );
    }
} 