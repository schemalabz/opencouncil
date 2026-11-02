import { NextRequest, NextResponse } from 'next/server';
import { getUtterancesForSubject } from '@/lib/db/subject';
import { isUserAuthorizedToEdit } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { subjectId } = await request.json();

        if (!subjectId) {
            return NextResponse.json(
                { error: 'Subject ID is required' },
                { status: 400 }
            );
        }

        // An unknown subject gets the same 403 as a refused one.
        const found = await getUtterancesForSubject(subjectId);
        if (!found || !(await isUserAuthorizedToEdit({ cityId: found.cityId }))) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        return NextResponse.json({ utterances: found.utterances });
    } catch (error) {
        console.error('Error fetching debug utterances:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
