import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { getDecisionsForMeeting, upsertDecision, deleteDecision } from '@/lib/db/decisions';
import prisma from '@/lib/db/prisma';
import { z } from 'zod';

export async function GET(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const decisions = await getDecisionsForMeeting(params.cityId, params.meetingId);
    return NextResponse.json(decisions);
}

const upsertSchema = z.object({
    subjectId: z.string().min(1),
    pdfUrl: z.string().url(),
    protocolNumber: z.string().optional(),
    ada: z.string().optional(),
    title: z.string().optional(),
    issueDate: z.string().datetime().optional(),
});

export async function PUT(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const session = await auth();
    const userId = session?.user?.id;

    const body = await request.json();
    const parsed = upsertSchema.parse(body);

    // Verify the subject belongs to this city and meeting
    const subject = await prisma.subject.findFirst({
        where: {
            id: parsed.subjectId,
            cityId: params.cityId,
            councilMeetingId: params.meetingId,
        },
    });

    if (!subject) {
        return NextResponse.json(
            { error: 'Subject not found in this meeting' },
            { status: 404 }
        );
    }

    const decision = await upsertDecision({
        subjectId: parsed.subjectId,
        pdfUrl: parsed.pdfUrl,
        protocolNumber: parsed.protocolNumber,
        ada: parsed.ada,
        title: parsed.title,
        issueDate: parsed.issueDate ? new Date(parsed.issueDate) : undefined,
        createdById: userId, // Track who manually added this decision
    });
    return NextResponse.json(decision);
}

export async function DELETE(
    request: Request,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');

    if (!subjectId) {
        return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
    }

    // Verify the subject belongs to this city and meeting
    const subject = await prisma.subject.findFirst({
        where: {
            id: subjectId,
            cityId: params.cityId,
            councilMeetingId: params.meetingId,
        },
    });

    if (!subject) {
        return NextResponse.json(
            { error: 'Subject not found in this meeting' },
            { status: 404 }
        );
    }

    await deleteDecision(subjectId);
    return NextResponse.json({ success: true });
}
