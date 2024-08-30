"use server";
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

interface DiarizationResponse {
    jobId: string;
    status: string;
    message: string;
}

const prisma = new PrismaClient();

export async function diarizeSpeakers(councilMeetingId: string, cityId: string): Promise<DiarizationResponse> {
    const apiUrl = 'https://api.pyannote.ai/v1/diarize';
    const token = process.env.PYANNOTE_API_TOKEN;

    if (!token) {
        throw new Error('PYANNOTE_API_TOKEN is not set in the environment variables');
    }

    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                cityId: cityId,
                id: councilMeetingId,
            },
        },
    });

    if (!councilMeeting) {
        throw new Error('Council meeting not found');
    }
    // Delete existing request if it exists
    await prisma.diarizationRequest.deleteMany({
        where: {
            councilMeetingId: councilMeetingId,
            cityId: cityId,
        },
    });

    // Create a new request
    const speakerDiarizationRequest = await prisma.diarizationRequest.create({
        data: {
            councilMeetingId: councilMeetingId,
            cityId: cityId,
        },
    });

    const callbackUrl = `${process.env.PUBLIC_URL}/api/diarization/${speakerDiarizationRequest.id}`;
    console.log('callbackUrl', callbackUrl);

    try {
        const response = await axios.post<DiarizationResponse>(
            apiUrl,
            {
                url: councilMeeting.video,
                webhook: callbackUrl,
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('response', response);
        await prisma.diarizationRequest.update({
            where: {
                id: speakerDiarizationRequest.id,
            },
            data: {
                jobId: response.data.jobId,
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error in diarizing speakers:', error);
        throw error;
    }
}

