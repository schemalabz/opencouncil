import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { calculateMeetingDurationMs } from '@/lib/db/utils/meetingDuration';
import { renderReportDocx, ReportMeeting } from '@/lib/export/report-docx';

export async function POST(request: NextRequest) {
    await withUserAuthorizedToEdit({});

    const body = await request.json();
    const { cityId, startDate, endDate, contractReference } = body as {
        cityId: string;
        startDate: string;
        endDate: string;
        contractReference: string;
    };

    if (!cityId || !startDate || !endDate || !contractReference) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { id: true, name: true, name_municipality: true },
    });

    if (!city) {
        return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    const offer = await prisma.offer.findFirst({
        where: { cityId },
        orderBy: { createdAt: 'desc' },
    });

    if (!offer) {
        return NextResponse.json({ error: 'No offer found for this city' }, { status: 404 });
    }

    const meetings = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            dateTime: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        },
        include: {
            speakerSegments: {
                select: {
                    utterances: {
                        select: { startTimestamp: true, endTimestamp: true },
                    },
                },
            },
            meetingOperator: {
                include: {
                    user: { select: { name: true } },
                },
            },
        },
        orderBy: { dateTime: 'asc' },
    });

    const reportMeetings: ReportMeeting[] = meetings.map(m => {
        const durationMs = m.speakerSegments.length > 0
            ? calculateMeetingDurationMs(m)
            : null;

        return {
            id: m.id,
            cityId: m.cityId,
            name: m.name,
            dateTime: m.dateTime,
            durationMs,
            operatorName: m.meetingOperator?.user.name || null,
        };
    });

    const blob = await renderReportDocx({
        city,
        offer,
        meetings: reportMeetings,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        contractReference,
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const filename = `report-${city.id}-${startDate}-${endDate}.docx`;

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
