import { NextRequest, NextResponse } from 'next/server';
import { Feed } from 'feed';
import { getTranslations } from 'next-intl/server';
import { formatInTimeZone } from 'date-fns-tz';
import sanitizeHtml from 'sanitize-html';
import { getCityCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache/queries';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { REALMS } from '@/lib/realm';
import { getRealm, getRealmBaseUrlFromRequest } from '@/lib/realm.server';
import { urlPrefixForLocale } from '@/i18n/config';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ locale: string; cityId: string }> }
) {
    const params = await props.params;
    const { locale, cityId } = params;
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);

    const city = await getCityCached(cityId);

    // Tenant isolation: route handlers don't run the [cityId] layout's realm
    // guard, so enforce it here — a city from another realm 404s even when its
    // slug is known (e.g. a French commune's feed requested on opencouncil.gr).
    const realm = await getRealm();
    if (!city || city.realm !== realm) {
        const t = await getTranslations({ locale, namespace: 'RSS' });
        return new NextResponse(t('cityNotFound'), { status: 404 });
    }

    const meetings = await getCouncilMeetingsForCityPublicCached(cityId, { limit });

    // The feed is served on the realm's domain and its default locale (el for
    // greece, fr for france) is the unprefixed one.
    const baseUrl = await getRealmBaseUrlFromRequest();
    const isDefaultLocale = locale === REALMS[realm].defaultLocale;
    // URL prefix, not locale id — sr-Latn lives under /lat.
    const localePrefix = urlPrefixForLocale(locale);
    const cityUrl = isDefaultLocale
        ? `${baseUrl}/${cityId}`
        : `${baseUrl}/${localePrefix}/${cityId}`;
    const feedUrl = isDefaultLocale
        ? `${baseUrl}/${cityId}/feed`
        : `${baseUrl}/${localePrefix}/${cityId}/feed`;

    // Get translations
    const t = await getTranslations({ locale, namespace: 'RSS' });

    // Create feed instance
    const feed = new Feed({
        title: t('title', { city: getLocalizedName(city, locale) }),
        description: t('description', {
            municipality: getLocalizedName(
                { name: city.name_municipality, name_en: city.name_municipality_en },
                locale,
            )
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
            : `${baseUrl}/${localePrefix}/${cityId}/${meeting.id}`;

        const cityName = getLocalizedName(city, locale);
        const dateStr = formatInTimeZone(meetingDate, city.timezone, 'yyyy-MM-dd');
        const meetingTitle = t('meetingTitle', {
            meetingName: getLocalizedName(meeting, locale),
            cityName,
            date: dateStr,
        });

        // Build description (short summary)
        let description = '';
        if (meeting.subjects.length > 0) {
            const subjectNames = meeting.subjects.slice(0, 3).map(s => localizeText(s.name, locale));
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
                    : `${baseUrl}/${localePrefix}/${cityId}/${meeting.id}/subjects/${subject.id}`;

                const sanitizeOptions = { allowedTags: [], allowedAttributes: {} };
                const subjectDescription = subject.description
                    ? `<p style="margin:0">${sanitizeHtml(localizeText(stripMarkdown(subject.description), locale), sanitizeOptions)}</p>`
                    : '';

                return `<li><a href="${subjectUrl}">${sanitizeHtml(localizeText(subject.name, locale), sanitizeOptions)}</a>${subjectDescription}</li><br/>`;
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
        });
    }

    const xml = feed.rss2();

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
        },
    });
}
