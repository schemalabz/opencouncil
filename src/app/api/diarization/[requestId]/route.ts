import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handleRequest(req: NextRequest, { params }: { params: { requestId: string } }) {
    const { requestId } = params;

    try {
        const diarizationRequest = await prisma.diarizationRequest.findUnique({
            where: { id: requestId },
            include: { councilMeeting: true },
        });

        if (!diarizationRequest) {
            return NextResponse.json({ error: 'Diarization request not found' }, { status: 404 });
        }

        const requestBody = await req.json() as {
            jobId: string;
            status: string;
            output: {
                diarization: Array<{
                    start: number;
                    end: number;
                    speaker: string;
                }>
            };

        }
        console.log('Received diarization result for request:', requestId);
        console.log('Council Meeting:', diarizationRequest.councilMeeting.name);

        prisma.diarizationRequest.update({
            where: { id: requestId },
            data: {
                status: requestBody.status,
            },
        });

        const speakerDiarizations = await prisma.speakerDiarization.createMany({
            data: requestBody.output.diarization.map((diarization) => ({
                startTimestamp: diarization.start,
                endTimestamp: diarization.end,
                label: diarization.speaker,
                councilMeetingId: diarizationRequest.councilMeetingId,
                cityId: diarizationRequest.cityId,
            })),
        });

        console.log(`Created ${speakerDiarizations.count} speaker diarizations`);

        return NextResponse.json({ message: 'Diarization result received' });
    } catch (error) {
        console.error('Error processing diarization result:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, context: { params: { requestId: string } }) {
    return handleRequest(req, context);
}

export async function POST(req: NextRequest, context: { params: { requestId: string } }) {
    return handleRequest(req, context);
}

export async function GET(req: NextRequest, context: { params: { requestId: string } }) {
    const { requestId } = context.params;

    try {
        const diarizationRequest = await prisma.diarizationRequest.findUnique({
            where: { id: requestId },
        });

        if (!diarizationRequest) {
            return NextResponse.json({ error: 'Diarization request not found' }, { status: 404 });
        }

        return NextResponse.json({ status: diarizationRequest.status, jobId: diarizationRequest.jobId });
    } catch (error) {
        console.error('Error getting diarization request status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
