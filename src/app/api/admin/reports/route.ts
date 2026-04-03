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

    if (typeof contractReference !== 'string' || contractReference.length > 200) {
        return NextResponse.json({ error: 'Invalid contract reference' }, { status: 400 });
    }

    // Validate date strings parse correctly and are in order
    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    if (startDate >= endDate) {
        return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
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

    // Client sends date-only strings (YYYY-MM-DD) to avoid timezone issues.
    // Construct UTC day boundaries for the query.
    const startDateUTC = new Date(startDate + 'T00:00:00.000Z');
    const endDateUTC = new Date(endDate + 'T23:59:59.999Z');

    const meetings = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            dateTime: {
                gte: startDateUTC,
                lte: endDateUTC,
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
        startDate: startDateUTC,
        endDate: endDateUTC,
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
