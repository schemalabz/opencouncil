import { NextRequest, NextResponse } from 'next/server';
import { getCityCached, getCouncilMeetingsForCityCached } from '@/lib/cache/queries';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 600; 

export async function GET(
    request: NextRequest,
    { params }: { params: { locale: string; cityId: string } }
) {
    const { locale, cityId } = params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);

    const city = await getCityCached(cityId);

    if (!city || !city.isListed || city.isPending) {
        return new NextResponse('City not found', { status: 404 });
    }

    const meetings = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            released: true,
        },
        orderBy: {
            dateTime: 'desc',
        },
        take: limit,
        include: {
            subjects: {
                take: 3,
            },
        },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr';
    const cityUrl = `${baseUrl}/${locale}/${cityId}`;
    const feedUrl = `${baseUrl}/${locale}/${cityId}/rss/meetings`;

    const lastBuildDate = meetings.length > 0 ? meetings[0].dateTime.toUTCString() : new Date().toUTCString();

    const title = locale === 'el' ? `Τελευταίες Συνεδριάσεις - ${city.name}` : `Latest Meetings - ${city.name_en}`;
    const description = locale === 'el' ? `Ενημερώσεις για τις συνεδριάσεις του ${city.name_municipality}` : `Updates for meetings of ${city.name_municipality_en}`;

    const items = meetings.map((meeting) => {
        const meetingDate = new Date(meeting.dateTime);
        const meetingUrl = locale === 'el' 
            ? `${baseUrl}/${cityId}/meetings/${meeting.id}`
            : `${baseUrl}/${locale}/${cityId}/meetings/${meeting.id}`;
        const meetingTitle = `${meeting.name} — ${city.name} (${meetingDate.toISOString().split('T')[0]})`;

        let itemDescription = meeting.subjects.map(s => s.name).join(', ');
        if (meeting.subjects.length === 3) itemDescription += '...';
        if (!itemDescription) itemDescription = 'No subjects listed.';

        return `
    <item>
      <title><![CDATA[${meetingTitle}]]></title>
      <link>${meetingUrl}</link>
      <guid isPermaLink="false">meeting-${meeting.id}</guid>
      <pubDate>${meetingDate.toUTCString()}</pubDate>
      <description><![CDATA[${itemDescription}]]></description>
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${cityUrl}</link>
    <description>${description}</description>
    <language>${locale}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
        },
    });
}
