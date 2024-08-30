import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const meetingSchema = z.object({
    name: z.string().min(2),
    date: z.string().datetime(),
    videoId: z.string().min(1),
    meetingId: z.string().min(1),
});

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const body = await request.json();
        const { name, date, videoId, meetingId } = meetingSchema.parse(body);
        const cityId = params.cityId;

        const meeting = await prisma.councilMeeting.create({
            data: {
                name,
                id: meetingId,
                dateTime: new Date(date),
                video: `https://townhalls-gr.fra1.digitaloceanspaces.com/city-council-meetings/${videoId}`,
                cityId,
                released: false, // Set as unpublished by default
            },
        });

        return NextResponse.json(meeting, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.log(error.errors);
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        console.error('Failed to create meeting:', error);
        return NextResponse.json(
            { error: 'Failed to create meeting' },
            { status: 500 }
        );
    }
}