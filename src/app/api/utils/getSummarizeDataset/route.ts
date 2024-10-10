import { NextRequest, NextResponse } from "next/server";
import { getSummarizeRequestBody } from "@/lib/db/utils";
import prisma from "@/lib/db/prisma";
import { stringify } from "csv-stringify/sync";

export async function GET(request: NextRequest) {
    try {
        // Fetch all council meetings
        const meetings = await prisma.councilMeeting.findMany({
            include: { city: true }
        });

        // Generate summarize request bodies for each meeting
        const rows = await Promise.all(meetings.map(async (meeting) => {
            const body = await getSummarizeRequestBody(meeting.id, meeting.cityId, []);
            return {
                meetingId: meeting.id,
                cityId: meeting.cityId,
                cityName: meeting.city.name,
                date: body.date,
                transcript: JSON.stringify(body.transcript),
                topicLabels: body.topicLabels.join(';'),
                requestedSubjects: body.requestedSubjects.join(';')
            };
        }));

        // Convert to CSV
        const csv = stringify(rows, {
            header: true,
            columns: ['meetingId', 'cityId', 'cityName', 'date', 'transcript', 'topicLabels', 'requestedSubjects']
        });

        // Return CSV as response
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename=summarize_requests.csv'
            }
        });
    } catch (error) {
        console.error('Error generating summarize requests:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}