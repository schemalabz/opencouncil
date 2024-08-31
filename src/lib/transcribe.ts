"use server";
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

interface TranscriptionResponse {
    jobId: string;
    status: string;
    message: string;
}

const prisma = new PrismaClient();

export async function requestTranscription(councilMeetingId: string, cityId: string): Promise<TranscriptionResponse> {
    const apiUrl = process.env.LEMONFOX_API_URL;
    const token = process.env.LEMONFOX_API_TOKEN;

    if (!apiUrl || !token) {
        throw new Error('LEMONFOX_API_URL or LEMONFOX_API_TOKEN is not set in the environment variables');
    }

    const councilMeeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                cityId: cityId,
                id: councilMeetingId,
            },
        },
        include: {
            city: true,
        },
    });

    if (!councilMeeting) {
        throw new Error('Council meeting not found');
    }

    // Delete existing request if it exists
    await prisma.transcriptionRequest.deleteMany({
        where: {
            councilMeetingId: councilMeetingId,
            cityId: cityId,
        },
    });

    // Create a new request
    const transcriptionRequest = await prisma.transcriptionRequest.create({
        data: {
            councilMeetingId: councilMeetingId,
            cityId: cityId,
        },
    });

    const callbackUrl = `${process.env.PUBLIC_URL}/api/transcription/${transcriptionRequest.id}`;
    console.log('callbackUrl', callbackUrl);

    const meetingDate = councilMeeting.dateTime.toISOString().split('T')[0];
    const prompt = `This transcript is from a city council meeting by the city of ${councilMeeting.city.name} in Greece. The meeting took place on ${meetingDate}.`;

    try {
        const response = await axios.post<TranscriptionResponse>(
            apiUrl,
            {
                file: councilMeeting.video,
                response_format: 'verbose_json',
                speaker_labels: false,
                prompt: prompt,
                language: 'greek',
                callback_url: callbackUrl,
                timestamp_granularities: ['word'],
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('response', response);
        await prisma.transcriptionRequest.update({
            where: {
                id: transcriptionRequest.id,
            },
            data: {
                jobId: response.data.jobId,
                status: response.data.status,
            },
        });

        return response.data;
    } catch (error) {
        console.error('Error in requesting transcription:', error);
        throw error;
    }
}
