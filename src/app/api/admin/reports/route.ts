import { NextRequest, NextResponse } from 'next/server';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { handleApiError } from '@/lib/api/errors';
import prisma from '@/lib/db/prisma';
import { calculateMeetingDurationMs } from '@/lib/db/utils/meetingDuration';
import { renderReportDocx, ReportMeeting } from '@/lib/export/report-docx';
import { getReportContract } from '@/lib/offers/state';
import { meetingLabel } from '@/lib/meetingName';
import { dayBounds } from '@/lib/dates/dayBounds';
import { reportRequestSchema } from '@/lib/zod-schemas/report';

export async function POST(request: NextRequest) {
    try {
        await withUserAuthorizedToEdit({});

        const { cityId, startDate, endDate, contractReference } = reportRequestSchema.parse(await request.json());

        const city = await prisma.city.findUnique({
            where: { id: cityId },
            select: { id: true, name: true, name_municipality: true, timezone: true },
        });

        if (!city) {
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
        }

        // The same contract the report form was prefilled from, so the prices
        // match the period and the contract reference the form sent.
        const offer = getReportContract(await prisma.offer.findMany({ where: { cityId } }));

        if (!offer) {
            return NextResponse.json({ error: 'No offer found for this city' }, { status: 404 });
        }

        // The period label and the month count of the document read these in
        // the server's zone, so they stay UTC days. The query reads the days
        // in the city's zone, where a meeting at local midnight belongs.
        const startDateUTC = dayBounds(startDate, 'UTC').start;
        const endDateUTC = dayBounds(endDate, 'UTC').end;

        const meetings = await prisma.councilMeeting.findMany({
            where: {
                cityId,
                dateTime: {
                    gte: dayBounds(startDate, city.timezone).start,
                    lte: dayBounds(endDate, city.timezone).end,
                },
            },
            include: {
                administrativeBody: { select: { name: true, name_en: true } },
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
                // The report prints the date in its own column.
                name: meetingLabel(m, 'el', city.timezone, { date: false }),
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
    } catch (error) {
        return handleApiError(error, 'Failed to build the report');
    }
}
