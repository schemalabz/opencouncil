import { NextRequest, NextResponse } from 'next/server';
import { Feed } from 'feed';
import { getTranslations } from 'next-intl/server';
import { getCityCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache/queries';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { env } from '@/env.mjs';
import { routing } from '@/i18n/routing';

export const revalidate = 600; // 10 minutes

export async function GET(
    request: NextRequest,
    { params }: { params: { locale: string; cityId: string } }
) {
    const { locale, cityId } = params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);

    const city = await getCityCached(cityId);

    if (!city) {
        const t = await getTranslations({ locale, namespace: 'RSS' });
        return new NextResponse(t('cityNotFound'), { status: 404 });
    }

    const meetings = await getCouncilMeetingsForCityPublicCached(cityId, { limit });

    const baseUrl = env.NEXTAUTH_URL;
    const isDefaultLocale = locale === routing.defaultLocale;
    const cityUrl = isDefaultLocale
        ? `${baseUrl}/${cityId}`
        : `${baseUrl}/${locale}/${cityId}`;
    const feedUrl = `${baseUrl}/${locale}/${cityId}/feed`;

    // Get translations
    const t = await getTranslations({ locale, namespace: 'RSS' });

    // Create feed instance
    const feed = new Feed({
        title: t('title', { city: isDefaultLocale ? city.name : city.name_en }),
        description: t('description', {
            municipality: isDefaultLocale ? city.name_municipality : city.name_municipality_en
        }),
        id: feedUrl,
        link: cityUrl,
        language: locale,
        updated: meetings.length > 0 ? new Date(meetings[0].dateTime) : new Date(),
        generator: 'OpenCouncil',
        feedLinks: {
            rss: feedUrl,
        },
        copyright: `Copyright © ${new Date().getFullYear()} OpenCouncil`,
    });

    // Add meeting items with nested subjects
    for (const meeting of meetings) {
        const meetingDate = new Date(meeting.dateTime);
        const meetingUrl = isDefaultLocale
            ? `${baseUrl}/${cityId}/${meeting.id}`
            : `${baseUrl}/${locale}/${cityId}/${meeting.id}`;

        const cityName = isDefaultLocale ? city.name : city.name_en;
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
                const subjectUrl = isDefaultLocale
                    ? `${baseUrl}/${cityId}/${meeting.id}/subjects/${subject.id}`
                    : `${baseUrl}/${locale}/${cityId}/${meeting.id}/subjects/${subject.id}`;

                const subjectDescription = subject.description
                    ? `<p style="margin:0">${stripMarkdown(subject.description)}</p>`
                    : '';

                return `<li><a href="${subjectUrl}">${subject.name}</a>${subjectDescription}</li><br/>`;
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
