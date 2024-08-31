import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handleRequest(req: NextRequest, { params }: { params: { requestId: string } }) {
    const { requestId } = params;

    try {
        const transcriptionRequest = await prisma.transcriptionRequest.findUnique({
            where: { id: requestId },
            include: { councilMeeting: true },
        });

        if (!transcriptionRequest) {
            return NextResponse.json({ error: 'Transcription request not found' }, { status: 404 });
        }

        const requestBody = await req.json();
        console.log('Received transcription result for request:', requestId);
        console.log('Council Meeting:', transcriptionRequest.councilMeeting.name);
        const segments = requestBody.data.segments;
        const fs = require('fs');
        const path = require('path');

        // Convert segments to JSON string
        const segmentsJson = JSON.stringify(segments, null, 2);

        // Write segments to file
        const filePath = path.join(process.env.HOME, 'test-segments.json');
        fs.writeFileSync(filePath, segmentsJson);
        console.log('Segments written to:', filePath);

        // Print segments to stdout
        console.log('Segments JSON:');
        console.log(segmentsJson);


        await prisma.transcriptionRequest.update({
            where: { id: requestId },
            data: {
                status: "completed",
                jobId: requestBody.jobId,
            },
        });

        return NextResponse.json({ message: 'Transcription result received' });
    } catch (error) {
        console.error('Error processing transcription result:', error);
        await prisma.transcriptionRequest.update({
            where: { id: requestId },
            data: {
                status: "failed",
            },
        });
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
        const transcriptionRequest = await prisma.transcriptionRequest.findUnique({
            where: { id: requestId },
        });

        if (!transcriptionRequest) {
            return NextResponse.json({ error: 'Transcription request not found' }, { status: 404 });
        }

        return NextResponse.json({ status: transcriptionRequest.status, jobId: transcriptionRequest.jobId });
    } catch (error) {
        console.error('Error getting transcription request status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
