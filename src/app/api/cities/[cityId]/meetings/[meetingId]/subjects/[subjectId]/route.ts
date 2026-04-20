import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { handleApiError } from '@/lib/api/errors';
import { z } from 'zod';

const patchSchema = z.object({
    nonAgendaReason: z.enum(['beforeAgenda', 'outOfAgenda']).nullable().optional(),
    withdrawn: z.boolean().optional(),
}).strict();

export async function PATCH(
    req: NextRequest,
    { params }: { params: { cityId: string; meetingId: string; subjectId: string } }
) {
    try {
        const user = await getCurrentUser();
        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Superadmin access required' }, { status: 403 });
        }

        const body = await req.json();
        const parsed = patchSchema.parse(body);

        if (Object.keys(parsed).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        const subject = await prisma.subject.findFirst({
            where: {
                id: params.subjectId,
                cityId: params.cityId,
                councilMeetingId: params.meetingId,
            },
        });

        if (!subject) {
            return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
        }

        const updated = await prisma.subject.update({
            where: { id: params.subjectId },
            data: parsed,
        });

        revalidateTag(`city:${params.cityId}:meeting:${params.meetingId}`);
        revalidatePath(`/${params.cityId}/${params.meetingId}`, 'layout');

        return NextResponse.json({
            id: updated.id,
            nonAgendaReason: updated.nonAgendaReason,
            withdrawn: updated.withdrawn,
        });
    } catch (error) {
        return handleApiError(error, 'Failed to update subject');
    }
}
