import { NextRequest, NextResponse } from 'next/server';
import { getUtterancesForSubject } from '@/lib/db/subject';

export async function POST(request: NextRequest) {
    try {
        const { subjectId } = await request.json();

        if (!subjectId) {
            return NextResponse.json(
                { error: 'Subject ID is required' },
                { status: 400 }
            );
        }

        // This function checks if user is superadmin internally
        const utterances = await getUtterancesForSubject(subjectId);

        // If not superadmin, returns null
        if (utterances === null) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        return NextResponse.json({ utterances });
    } catch (error) {
        console.error('Error fetching debug utterances:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
