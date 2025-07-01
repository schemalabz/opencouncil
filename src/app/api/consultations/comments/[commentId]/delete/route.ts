import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteConsultationComment } from '@/lib/db/consultations';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { commentId: string } }
) {
    try {
        const session = await auth();

        await deleteConsultationComment(
            params.commentId,
            session
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting comment:', error);

        if (error instanceof Error) {
            return NextResponse.json(
                { error: error.message },
                {
                    status: error.message === 'Authentication required' ? 401 :
                        error.message === 'You can only delete your own comments' ? 403 :
                            error.message === 'Comment not found' ? 404 :
                                error.message === 'User not found' ? 404 : 400
                }
            );
        }

        return NextResponse.json(
            { error: 'Failed to delete comment' },
            { status: 500 }
        );
    }
} 