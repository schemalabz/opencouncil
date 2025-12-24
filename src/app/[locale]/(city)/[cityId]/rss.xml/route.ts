import { NextRequest, NextResponse } from 'next/server';
import { Feed } from 'feed';
import { getTranslations } from 'next-intl/server';
import { getCityCached } from '@/lib/cache/queries';
import { prisma } from '@/lib/db/prisma';

export const revalidate = 600; // 10 minutes

export async function GET(
    request: NextRequest,
    { params }: { params: { locale: string; cityId: string } }
) {
    const { locale, cityId } = params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);

    const city = await getCityCached(cityId);

    if (!city || !city.isListed || city.isPending) {
        const t = await getTranslations({ locale, namespace: 'RSS' });
        return new NextResponse(t('cityNotFound'), { status: 404 });
    }

    // Fetch meetings with all subjects
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
                orderBy: {
                    createdAt: 'asc',
                },
            },
        },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr';
    const cityUrl = locale === 'el' 
        ? `${baseUrl}/${cityId}`
        : `${baseUrl}/${locale}/${cityId}`;
    const feedUrl = `${baseUrl}/${locale}/${cityId}/rss.xml`;

    // Get translations
    const t = await getTranslations({ locale, namespace: 'RSS' });

    // Create feed instance
    const feed = new Feed({
        title: t('title', { city: locale === 'el' ? city.name : city.name_en }),
        description: t('description', { 
            municipality: locale === 'el' ? city.name_municipality : city.name_municipality_en 
        }),
        id: feedUrl,
        link: cityUrl,
        language: locale,
        updated: meetings.length > 0 ? meetings[0].dateTime : new Date(),
        generator: 'OpenCouncil',
        feedLinks: {
            rss: feedUrl,
        },
        // Add required copyright field to conform to FeedOptions
        copyright: `Copyright © ${new Date().getFullYear()} OpenCouncil`,
    });

    // Add meeting items with nested subjects
    for (const meeting of meetings) {
        const meetingDate = new Date(meeting.dateTime);
        const meetingUrl = locale === 'el'
            ? `${baseUrl}/${cityId}/meetings/${meeting.id}`
            : `${baseUrl}/${locale}/${cityId}/meetings/${meeting.id}`;
        
        const cityName = locale === 'el' ? city.name : city.name_en;
        const dateStr = meetingDate.toISOString().split('T')[0];
        const meetingTitle = t('meetingTitle', {
            meetingName: meeting.name,
            cityName,
            date: dateStr,
        });

        // Build description (short summary)
        let description = '';
        if (meeting.subjects.length > 0) {
            const subjectNames = meeting.subjects.slice(0, 3).map(s => s.name);
            description = subjectNames.join(', ');
            if (meeting.subjects.length > 3) {
                description += '...';
            }
        } else {
            description = t('noSubjects');
        }

        // Build content with nested subjects (HTML)
        let content = '';
        if (meeting.subjects.length > 0) {
            const subjectsList = meeting.subjects.map(subject => {
                const subjectUrl = locale === 'el'
                    ? `${baseUrl}/${cityId}/meetings/${meeting.id}/subjects/${subject.id}`
                    : `${baseUrl}/${locale}/${cityId}/meetings/${meeting.id}/subjects/${subject.id}`;
                
                const subjectDescription = subject.description 
                    ? `<p>${subject.description}</p>` 
                    : '';
                
                return `<li><a href="${subjectUrl}">${subject.name}</a>${subjectDescription}</li>`;
            }).join('');
            
            content = `<h3>${t('subjects')}</h3><ul>${subjectsList}</ul>`;
        } else {
            content = `<p>${t('noSubjects')}</p>`;
        }

        feed.addItem({
            title: meetingTitle,
            id: `meeting-${meeting.id}`,
            link: meetingUrl,
            description,
            content,
            date: meetingDate,
            guid: `meeting-${meeting.id}`,
        });
    }

    const xml = feed.rss2();

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
        },
    });
}

