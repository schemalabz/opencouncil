import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { format, subMonths } from "date-fns";
import { AdministrativeBody, AdministrativeBodyType, City, Party } from "@prisma/client";
import { DateRange } from "react-day-picker";

import { getCities } from "@/lib/db/cities";
import { getPartiesForCity } from "@/lib/db/parties";
import { getAdministrativeBodiesWithPublicMeetings } from "@/lib/db/administrativeBodies";
import { getPeopleForCity, getPerson, PersonWithRelations } from "@/lib/db/people";
import { getLocalizedName, getLocalizedShortName } from "@/lib/formatters/name";
import { getDateFnsLocale, getIntlLocale } from "@/lib/formatters/time";
import { useTopics } from "@/hooks/useTopics";
import { getPartyFromRoles } from "@/lib/utils";
import { ADMIN_BODY_TYPE_ORDER } from "@/lib/utils/administrativeBodies";
import {
    formatFilterDate,
    parseFilterDate,
    type FilterPatch,
    type SearchFilterParams,
} from "../searchFilterTypes";

/** Administrative bodies of one type, under that type's display label. */
export type AdminBodyGroup = {
    type: AdministrativeBodyType;
    typeLabel: string;
    bodies: { value: string; label: string }[];
};

export const DATE_PRESET_MONTHS = [3, 6, 12] as const;

/** Everything `useSearchFilterData` hands to the two filter surfaces. */
export type SearchFilterData = ReturnType<typeof useSearchFilterData>;

/**
 * All the data-fetching and derived state behind the /search filters — city, administrative
 * body, party, person, topic and date range — shared by the desktop pill row (SearchFilters)
 * and the mobile full-screen panel (SearchFilterSections), which only differ in how they
 * present this same state.
 *
 * Called ONCE, by SearchPage, and passed to both surfaces as a prop. Both are mounted at the
 * same time — the desktop bar is hidden with CSS rather than unmounted — so a hook instance
 * per surface would fetch every city, party, administrative body, person and topic twice.
 */
export function useSearchFilterData(filters: SearchFilterParams, setFilters: (patch: FilterPatch) => void) {
    const tCommon = useTranslations("Common");
    const tFilters = useTranslations("search.filters");
    const locale = useLocale();

    const [cities, setCities] = useState<City[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [adminBodies, setAdminBodies] = useState<AdministrativeBody[]>([]);
    const [people, setPeople] = useState<PersonWithRelations[]>([]);
    const [person, setPerson] = useState<PersonWithRelations | null>(null);
    const { topics, isLoading: topicsLoading, error: topicsError } = useTopics();

    useEffect(() => {
        let live = true;
        getCities()
            .then(result => { if (live) setCities(result); })
            .catch(error => console.error("Error fetching cities:", error));
        return () => { live = false; };
    }, []);

    // Parties, administrative bodies and people are city-scoped, so they reload
    // whenever the city changes and empty out when it is cleared.
    //
    // The lists are emptied up front on every change, not only when the city is
    // cleared. Holding the previous city's data until the new response lands
    // left the Party and Person pills offering members of a municipality the
    // City pill no longer named, and picking one wrote a party of the wrong city
    // into the URL. An empty list for the length of one round trip is the honest
    // state; `live` then discards a response whose city is already stale, so two
    // quick changes cannot land in reverse order.
    useEffect(() => {
        setParties([]);
        setAdminBodies([]);
        setPeople([]);
        if (!filters.cityId) return;
        let live = true;
        const cityId = filters.cityId;
        getPartiesForCity(cityId)
            .then(result => { if (live) setParties(result); })
            .catch(error => console.error("Error fetching parties:", error));
        getAdministrativeBodiesWithPublicMeetings(cityId)
            .then(result => { if (live) setAdminBodies(result); })
            .catch(error => console.error("Error fetching administrative bodies:", error));
        getPeopleForCity(cityId)
            .then(result => { if (live) setPeople(result); })
            .catch(error => console.error("Error fetching people:", error));
        return () => { live = false; };
    }, [filters.cityId]);

    // A person page deep link (`/search?personId=`) can arrive before the city it
    // implies is in the URL, so the pill has no `people` list to read the name
    // from yet. Fetched on its own to keep the pill labelled meanwhile.
    //
    // Cleared up front rather than left in place while the new person loads:
    // this is the fallback the pill label reads, so holding the previous
    // person's record would label the pill with the person the user just
    // navigated away from.
    useEffect(() => {
        setPerson(null);
        if (!filters.personId) return;
        let live = true;
        getPerson(filters.personId)
            .then(result => { if (live) setPerson(result); })
            .catch(error => console.error("Error fetching person:", error));
        return () => { live = false; };
    }, [filters.personId]);

    const selectedTopicIds = useMemo(
        () => (filters.topicIds ? filters.topicIds.split(",").filter(Boolean) : []),
        [filters.topicIds]
    );
    const selectedTopics = useMemo(
        () => topics.filter(topic => selectedTopicIds.includes(topic.id)),
        [topics, selectedTopicIds]
    );

    const selectedCity = cities.find(c => c.id === filters.cityId) ?? null;
    const selectedParty = parties.find(p => p.id === filters.partyId) ?? null;
    const selectedAdminBody = adminBodies.find(b => b.id === filters.adminBodyId) ?? null;

    // Members of the selected party, by their currently active role. Unfiltered
    // when no party is chosen — the pill then offers the whole city.
    const availablePeople = useMemo(() => {
        if (!filters.partyId) return people;
        return people.filter(p => getPartyFromRoles(p.roles)?.id === filters.partyId);
    }, [people, filters.partyId]);

    // Prefer the city list, fall back to the separately fetched person so a deep
    // link is labelled before the city list arrives.
    const selectedPerson = people.find(p => p.id === filters.personId) ?? person;
    const personLabel = filters.personId && selectedPerson
        ? getLocalizedShortName(selectedPerson, locale)
        : filters.personId
            ? "…"
            : null;

    // Body names go through getLocalizedName, like every other name on the page
    // — SubjectRow renders the same body that way, so a raw `.name` here would
    // put two different names for one body on one screen. The sort collates
    // under the active locale for the same reason.
    const bodyGroups = useMemo<AdminBodyGroup[]>(() => {
        const present = new Set(adminBodies.map(b => b.type));
        const collator = new Intl.Collator(getIntlLocale(locale));
        return ADMIN_BODY_TYPE_ORDER.filter(type => present.has(type)).map(type => ({
            type,
            typeLabel: tCommon(`adminBodyType_${type}`),
            bodies: adminBodies
                .filter(b => b.type === type)
                .map(b => ({ value: b.id, label: getLocalizedName(b, locale) }))
                .sort((a, b) => collator.compare(a.label, b.label)),
        }));
    }, [adminBodies, tCommon, locale]);

    const adminBodyLabel = selectedAdminBody
        ? getLocalizedName(selectedAdminBody, locale)
        : filters.adminBodyType
            ? tCommon(`adminBodyType_${filters.adminBodyType}`)
            : null;

    const dateRange = useMemo<DateRange | undefined>(() => {
        const from = parseFilterDate(filters.dateFrom);
        if (!from) return undefined;
        return { from, to: parseFilterDate(filters.dateTo) };
    }, [filters.dateFrom, filters.dateTo]);

    // Which preset (if any) the current range matches, so its button can show
    // as selected instead of leaving every preset looking equally inert.
    const activePresetMonths = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to) return null;
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        if (Math.abs(dateRange.to.getTime() - now) > DAY_MS) return null;
        return DATE_PRESET_MONTHS.find(
            months => Math.abs(dateRange.from!.getTime() - subMonths(new Date(), months).getTime()) < DAY_MS
        ) ?? null;
    }, [dateRange]);

    // Abbreviated month rather than formatDate's `dateStyle: 'long'`: the pill is
    // ~13rem wide and has to hold two of these plus a dash. The locale comes from
    // getDateFnsLocale (src/lib/formatters/time.ts) — hardcoding the Greek locale
    // here printed Greek month names on the English and French sites.
    const dateFnsLocale = useMemo(() => getDateFnsLocale(locale), [locale]);
    const dateLabel = useMemo(() => {
        if (!dateRange?.from) return null;
        // A range that matches a preset reads as the preset, not as two dates —
        // "last 3 months" is what the user picked and is far shorter.
        if (activePresetMonths) return tFilters("dateLastMonths", { count: activePresetMonths });
        const from = format(dateRange.from, "d MMM yyyy", { locale: dateFnsLocale });
        if (!dateRange.to) return from;
        return `${from} – ${format(dateRange.to, "d MMM yyyy", { locale: dateFnsLocale })}`;
    }, [dateRange, activePresetMonths, tFilters, dateFnsLocale]);

    // Clearing the city invalidates everything scoped to it.
    const onCityChange = useCallback((cityId: string | undefined) => {
        setFilters({
            cityId,
            partyId: undefined,
            personId: undefined,
            adminBodyType: undefined,
            adminBodyId: undefined,
        });
    }, [setFilters]);

    const applyDateRange = useCallback((range: DateRange | undefined) => {
        setFilters({
            dateFrom: range?.from ? formatFilterDate(range.from) : undefined,
            dateTo: range?.to ? formatFilterDate(range.to) : undefined,
        });
    }, [setFilters]);

    const clearAll = useCallback(() => {
        setFilters({
            cityId: undefined,
            partyId: undefined,
            personId: undefined,
            adminBodyType: undefined,
            adminBodyId: undefined,
            topicIds: undefined,
            dateFrom: undefined,
            dateTo: undefined,
        });
    }, [setFilters]);

    return {
        locale,
        cities,
        parties,
        adminBodies,
        people,
        topics,
        topicsLoading,
        topicsError,
        selectedTopicIds,
        selectedTopics,
        selectedCity,
        selectedParty,
        selectedAdminBody,
        availablePeople,
        personLabel,
        bodyGroups,
        adminBodyLabel,
        dateRange,
        activePresetMonths,
        dateLabel,
        onCityChange,
        applyDateRange,
        clearAll,
    };
}
