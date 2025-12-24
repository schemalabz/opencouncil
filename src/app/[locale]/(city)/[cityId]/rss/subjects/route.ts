import { NextRequest, NextResponse } from 'next/server';
import { getCityCached } from '@/lib/cache/queries';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 600; 

export async function GET(
    request: NextRequest,
    { params }: { params: { locale: string; cityId: string } }
) {
    const { locale, cityId } = params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 100);

    const city = await getCityCached(cityId);

    if (!city || !city.isListed || city.isPending) {
        return new NextResponse('City not found', { status: 404 });
    }

    const subjects = await prisma.subject.findMany({
        where: {
            cityId,
            councilMeeting: {
                released: true,
            },
        },
        orderBy: {
            createdAt: 'desc', 
        },
        take: limit,
        include: {
            councilMeeting: {
                select: {
                    id: true,
                    name: true,
                    dateTime: true,
                },
            },
        },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr';
    const cityUrl = `${baseUrl}/${locale}/${cityId}`;
    const feedUrl = `${baseUrl}/${locale}/${cityId}/rss/subjects`;

    const lastBuildDate = subjects.length > 0 ? subjects[0].createdAt.toUTCString() : new Date().toUTCString();

    const title = locale === 'el' ? `Τελευταία Θέματα - ${city.name}` : `Latest Subjects - ${city.name_en}`;
    const description = locale === 'el' ? `Ενημερώσεις για τα θέματα των συνεδριάσεων του ${city.name_municipality}` : `Updates for subjects of meetings of ${city.name_municipality_en}`;

    const items = subjects.map((subject) => {
        const subjectDate = new Date(subject.createdAt);
        const subjectUrl = locale === 'el'
            ? `${baseUrl}/${cityId}/meetings/${subject.councilMeeting.id}/subjects/${subject.id}`
            : `${baseUrl}/${locale}/${cityId}/meetings/${subject.councilMeeting.id}/subjects/${subject.id}`;
        const subjectTitle = `${subject.name} — ${subject.councilMeeting.name}`;

        const itemDescription = subject.description || 'No description available.';

        return `
    <item>
      <title><![CDATA[${subjectTitle}]]></title>
      <link>${subjectUrl}</link>
      <guid isPermaLink="false">subj-${subject.id}</guid>
      <pubDate>${subjectDate.toUTCString()}</pubDate>
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
