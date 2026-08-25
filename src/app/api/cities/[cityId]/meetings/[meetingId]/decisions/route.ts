import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { getDecisionsForMeeting, getExtractedDataForMeeting, getMeetingAttendance, upsertDecision, deleteDecision, clearExtractedDataForMeeting, resetExtractionForSubject } from '@/lib/db/decisions';
import { getUnresolvedCandidatesForMeeting, assignCandidate, dismissCandidate, getBackedDecisionIds } from '@/lib/db/decisionCandidates';
import prisma from '@/lib/db/prisma';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

export async function GET(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const [decisions, extractedData, meetingAttendance, candidates] = await Promise.all([
        getDecisionsForMeeting(params.cityId, params.meetingId),
        getExtractedDataForMeeting(params.cityId, params.meetingId),
        getMeetingAttendance(params.cityId, params.meetingId),
        getUnresolvedCandidatesForMeeting(params.cityId, params.meetingId),
    ]);

    // Unlink is only reversible when a candidate row backs the decision
    // (onDelete: SetNull returns it to the unplaced pool). The UI warns
    // before unlinking the unbacked rest (legacy ADA-less decisions).
    const backedIds = await getBackedDecisionIds(decisions.map((d) => d.id));
    const decisionsWithBacking = decisions.map((d) => ({ ...d, candidateBacked: backedIds.has(d.id) }));

    return NextResponse.json({ decisions: decisionsWithBacking, extractedData, meetingAttendance, candidates });
}

const upsertSchema = z.object({
    subjectId: z.string().min(1),
    pdfUrl: z.string().url(),
    protocolNumber: z.string().optional(),
    ada: z.string().optional(),
    title: z.string().optional(),
    publishDate: z.string().datetime().optional(),
});

export async function PUT(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
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
        publishDate: parsed.publishDate ? new Date(parsed.publishDate) : undefined,
        createdById: userId, // Track who manually added this decision
    });
    revalidateTag(`city:${params.cityId}:meetings`, 'max');
    return NextResponse.json(decision);
}

export async function DELETE(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
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
    revalidateTag(`city:${params.cityId}:meetings`, 'max');
    return NextResponse.json({ success: true });
}

const postSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('clearExtractedData') }),
    z.object({ action: z.literal('resetExtraction'), subjectId: z.string().min(1) }),
    z.object({ action: z.literal('assignCandidate'), candidateId: z.string().min(1), subjectId: z.string().min(1) }),
    z.object({ action: z.literal('dismissCandidate'), candidateId: z.string().min(1) }),
]);

export async function POST(
    request: Request,
    props: { params: Promise<{ cityId: string; meetingId: string }> }
) {
    const params = await props.params;
    await withUserAuthorizedToEdit({ cityId: params.cityId });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid action', details: parsed.error.errors }, { status: 400 });
    }

    // Destructive extraction operations are superadmin-only; the city-admin
    // tier only manages links (assign/dismiss, and PUT/DELETE above).
    if (parsed.data.action === 'clearExtractedData' || parsed.data.action === 'resetExtraction') {
        const user = await getCurrentUser();
        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Superadmin required' }, { status: 403 });
        }
    }

    if (parsed.data.action === 'clearExtractedData') {
        const result = await clearExtractedDataForMeeting(params.cityId, params.meetingId);
        revalidateTag(`city:${params.cityId}:meetings`, 'max');
        return NextResponse.json(result);
    }

    if (parsed.data.action === 'assignCandidate') {
        // Verify the target subject belongs to this city and meeting
        const subject = await prisma.subject.findFirst({
            where: { id: parsed.data.subjectId, cityId: params.cityId, councilMeetingId: params.meetingId },
        });
        if (!subject) {
            return NextResponse.json({ error: 'Subject not found in this meeting' }, { status: 404 });
        }
        const session = await auth();
        try {
            await assignCandidate(params.cityId, params.meetingId, parsed.data.candidateId, parsed.data.subjectId, session?.user?.id);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : 'Assignment failed' }, { status: 409 });
        }
        revalidateTag(`city:${params.cityId}:meetings`, 'max');
        return NextResponse.json({ success: true });
    }

    if (parsed.data.action === 'dismissCandidate') {
        try {
            await dismissCandidate(params.cityId, params.meetingId, parsed.data.candidateId);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : 'Dismiss failed' }, { status: 409 });
        }
        return NextResponse.json({ success: true });
    }

    // action === 'resetExtraction'
    const subject = await prisma.subject.findFirst({
        where: {
            id: parsed.data.subjectId,
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

    await resetExtractionForSubject(parsed.data.subjectId);
    revalidateTag(`city:${params.cityId}:meetings`, 'max');
    return NextResponse.json({ success: true });
}
