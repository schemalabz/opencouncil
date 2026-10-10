import { NextRequest, NextResponse } from 'next/server';
import { getVotingUtterances } from '@/lib/db/votingUtterances';

export async function POST(request: NextRequest) {
    try {
        const { subjectId } = await request.json();

        if (!subjectId) {
            return NextResponse.json(
                { error: 'Subject ID is required' },
                { status: 400 }
            );
        }

        const utterances = await getVotingUtterances(subjectId);

        return NextResponse.json({ utterances });
    } catch (error) {
        console.error('Error fetching voting utterances:', error);
        return NextResponse.json(
            { error: 'Failed to fetch voting utterances' },
            { status: 500 }
        );
    }
}
