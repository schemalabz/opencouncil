import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getUnreleasedScope } from "@/lib/auth";
import { DEFAULT_MEETING_PAGE_SIZE, findMeetingIdsMatching } from "@/lib/db/meetingsList";
import { isSecondaryBody, readTier } from "@/lib/utils/bodyTier";
import CityMeetings from "@/components/cities/CityMeetings";
import {
    getCityCached,
    getCouncilMeetingsPreviewCached,
    getCouncilMeetingPreviewsByIds,
    countCouncilMeetingsCached,
    getAdministrativeBodiesWithPublicMeetingsCached,
    getPublicAdministrativeBodiesForCityCached,
} from "@/lib/cache";
import { withCanonicalUrl } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';
import { parseCollectionParams, toURLSearchParams } from '@/lib/utils/filterURL';
import { meetingBodyFilter, meetingsTabFilters } from '@/lib/meetingsTab';
import { clampPage, pageSlice } from '@/lib/zod-schemas/listQuery';

export async function generateMetadata(
    props: {
        params: Promise<{ cityId: string; locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        cityId,
        locale
    } = params;

    const city = await getCityCached(cityId);
    const t = await getTranslations({ locale, namespace: 'metadata.meetings' });

    if (!city) {
        return withCanonicalUrl(`/${cityId}/meetings`, {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        });
    }

    const cityName = getLocalizedName(city, locale);
    const title = t('title', { cityName });
    const description = t('description', { cityName, meetingsCount: city._count.councilMeetings });
    const ogImageUrl = buildOgImageUrl(locale, { cityId });

    return withCanonicalUrl(`/${cityId}/meetings`, {
        title,
        description,
        keywords: [cityName, ...(t.raw('keywords') as string[]), "OpenCouncil"],
        authors: [{ name: t('author', { cityName }) }],
        openGraph: {
            title,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: t('ogAlt', { cityName }),
                },
            ],
            locale: getOgLocale(locale),
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [ogImageUrl],
        },
    });
}

/** The body filter of the list: the ids of a selection, or every tier when the reader widened the tab (#829). */
type BodyFilter = NonNullable<ReturnType<typeof meetingBodyFilter>> | { tier: 'all' };

/**
 * One page of the list and its total. The count comes first, so only a page
 * that exists is queried and cached: an arbitrary ?page= would otherwise reach
 * the database as an offset, and leave a cache entry for every number tried.
 */
async function loadListPage(cityId: string, filter: BodyFilter, requestedPage: number, pageSize: number) {
    const total = await countCouncilMeetingsCached(cityId, filter);
    const page = clampPage(requestedPage, total, pageSize);
    const rows = total > 0 ? await getCouncilMeetingsPreviewCached(cityId, { ...filter, page, pageSize }) : [];
    return { rows, total, page };
}

/** One page of the meetings whose ids the search found. */
async function loadSearchPage(cityId: string, ids: string[], requestedPage: number, pageSize: number) {
    const page = clampPage(requestedPage, ids.length, pageSize);
    const pageIds = pageSlice(ids, page, pageSize);
    const rows = pageIds.length > 0 ? await getCouncilMeetingPreviewsByIds(cityId, pageIds) : [];
    return { rows, total: ids.length, page };
}

/**
 * The meetings tab. It reads the view from the URL and loads only the page on
 * screen and the total, so every meeting of the city is reachable through the
 * pages and the payload does not grow with the archive.
 */
export default async function MeetingsPage(
    props: {
        params: Promise<{ cityId: string; locale: string }>;
        searchParams: Promise<Record<string, string | string[] | undefined>>;
    }
) {
    const [{ cityId, locale }, searchParams] = await Promise.all([props.params, props.searchParams]);

    const [city, publicBodies, allBodies, unreleased, tCommon] = await Promise.all([
        getCityCached(cityId),
        // The picker's own source. Deriving it from the listed rows hid every
        // body whose last meeting fell outside them.
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
        // Every body, unreleased-only ones included, for the type-to-ids filter.
        getPublicAdministrativeBodiesForCityCached(cityId),
        // A city admin edits every meeting; a body admin adds meetings of their bodies.
        getUnreleasedScope(cityId),
        getTranslations({ locale, namespace: 'Common' }),
    ]);
    const canEdit = unreleased.all || unreleased.bodyIds.length > 0;
    // The picker offers the bodies with a released meeting. The bodies the
    // editor administers join it, every body for a city admin and their own
    // for a body admin: the drafts of a body with no released meeting yet
    // would otherwise hide behind the default chip with no chip to reach them.
    const editorBodies = !canEdit
        ? []
        : allBodies.filter(body => unreleased.all || unreleased.bodyIds.includes(body.id));
    const everyBody = [...publicBodies, ...editorBodies.filter(body => !publicBodies.some(known => known.id === body.id))];

    if (!city) {
        notFound();
    }

    // The secondary tier (#829) loads on request, or for the admin of a body
    // of it: their drafts must be reachable without a click they cannot know
    // to make. A city admin keeps the primary tier and the checkbox. A city
    // with no meeting of the primary tier shows the secondary tier at once:
    // an empty tab would be its only page.
    const secondaryAvailable = everyBody.some(isSecondaryBody);
    const tier = readTier(searchParams.tier);
    const administersSecondary = !unreleased.all && editorBodies.some(isSecondaryBody);
    const primaryEmpty = secondaryAvailable && tier === null && !administersSecondary
        ? (await countCouncilMeetingsCached(cityId, {})) === 0
        : false;
    const showSecondary = secondaryAvailable
        && (tier === 'all' || (tier === null && (administersSecondary || primaryEmpty)));
    const administrativeBodies = showSecondary ? everyBody : everyBody.filter(body => !isSecondaryBody(body));

    const pageSize = DEFAULT_MEETING_PAGE_SIZE;
    const view = parseCollectionParams(toURLSearchParams(searchParams), meetingsTabFilters(administrativeBodies, tCommon, { widened: showSecondary }));
    // With the tier widened, «all» spans both tiers; the list's own default is the primary tier.
    const bodyFilter = meetingBodyFilter(view, allBodies);
    const filter = bodyFilter && showSecondary && !bodyFilter.administrativeBodyIds ? { tier: 'all' as const } : bodyFilter;
    const matchingIds = filter && view.query.trim()
        ? await findMeetingIdsMatching(cityId, view.query, { ...filter, unreleased }, locale, city.timezone)
        : null;

    const { rows, total, page } = !filter
        ? { rows: [], total: 0, page: 1 }
        : matchingIds
            ? await loadSearchPage(cityId, matchingIds, view.page, pageSize)
            : await loadListPage(cityId, filter, view.page, pageSize);

    return (
        <CityMeetings
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            cityId={cityId}
            realm={city.realm}
            timezone={city.timezone}
            canEdit={canEdit}
            editableBodyIds={unreleased.all ? undefined : unreleased.bodyIds}
            administrativeBodies={administrativeBodies}
            secondaryTier={{ available: secondaryAvailable, shown: showSecondary }}
            now={new Date()}
        />
    );
}
