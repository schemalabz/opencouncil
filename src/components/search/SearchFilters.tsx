"use client";

import { useTranslations } from "next-intl";
import { subMonths } from "date-fns";
import { CalendarDays, Check, Landmark, MapPin, Tag, User, Users } from "lucide-react";
import { cn, getPartyFromRoles } from "@/lib/utils";
import { getLocalizedName, getLocalizedShortName } from "@/lib/formatters/name";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TopicIcon } from "@/components/TopicIcon";
import FilterPill from "./FilterPill";
import { AdminBodyOptions, FilterListItem } from "./filterOptionList";
import { DATE_PRESET_MONTHS, type SearchFilterData } from "./hooks/useSearchFilterData";
import { type FilterPatch, type SearchFilterParams } from "./searchFilterTypes";

/** The /search page's desktop filter bar: one pill per filter, each opening its control in a
 *  popover. The mobile equivalent is SearchFilterSections, shown inside a full-screen overlay.
 *
 *  No clear-all button here: with fixed-width pills it never fit on the pill line and wrapped to
 *  a line of its own. Each active pill carries its own clear button, and there are six at most.
 *  The mobile panel, which has the vertical room, keeps its clear-all. */
export default function SearchFilters({
    filters,
    setFilters,
    data,
    disabled = false,
    className,
}: {
    filters: SearchFilterParams;
    setFilters: (patch: FilterPatch) => void;
    /** Shared with the mobile panel — see SearchPage, which owns the one instance. */
    data: SearchFilterData;
    disabled?: boolean;
    className?: string;
}) {
    const t = useTranslations("search.filters");
    const tCommon = useTranslations("Common");
    const {
        locale,
        cities,
        parties,
        topics,
        topicsLoading,
        topicsError,
        selectedTopicIds,
        selectedTopics,
        selectedCity,
        selectedParty,
        availablePeople,
        personLabel,
        bodyGroups,
        adminBodyLabel,
        dateRange,
        activePresetMonths,
        dateLabel,
        onCityChange,
        applyDateRange,
    } = data;

    const topicLabel = selectedTopics.length === 0 ? null : getLocalizedName(selectedTopics[0], locale);
    const topicSuffix = selectedTopics.length > 1 ? `+${selectedTopics.length - 1}` : null;

    return (
        // Desktop only — SearchPage renders this `hidden md:flex` and gives narrow
        // screens the full-screen panel instead, so there is no sub-md state to
        // style for. The pills grow (`grow` in FilterPill) past their base widths
        // to fill the row, so the bar spans the same width as the search input
        // above; wrapping stays on for widths where the base widths don't fit on
        // one line.
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <FilterPill
                label={t("city")}
                value={selectedCity ? getLocalizedName(selectedCity, locale) : null}
                icon={MapPin}
                disabled={disabled}
                clear={{
                    label: t("clearField", { field: t("city") }),
                    onClear: () => onCityChange(undefined),
                }}
                widthClassName="w-44"
            >
                {close => (
                    <Command>
                        <CommandInput placeholder={t("cityPlaceholder")} />
                        <CommandList>
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <CommandGroup>
                                {cities.map(city => (
                                    <FilterListItem
                                        key={city.id}
                                        searchValue={getLocalizedName(city, locale)}
                                        label={getLocalizedName(city, locale)}
                                        selected={filters.cityId === city.id}
                                        onSelect={() => {
                                            onCityChange(city.id);
                                            close();
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </FilterPill>

            {/* The next three are city-scoped. They stay in the row and go
                disabled without a city, so the bar keeps one stable shape
                instead of growing as it is used. */}

            {/* One searchable list rather than two rows of badges: a city like
                Athens has a dozen bodies, which a badge grid stacks one per row.
                Grouping by type keeps the two levels legible — the group heading
                gives each "all of this type" row the context a bare badge lacked. */}
            <FilterPill
                label={t("administration")}
                value={adminBodyLabel}
                icon={Landmark}
                disabled={disabled || !filters.cityId || bodyGroups.length === 0}
                clear={{
                    label: t("clearField", { field: t("administration") }),
                    onClear: () => setFilters({ adminBodyType: undefined, adminBodyId: undefined }),
                }}
                widthClassName="w-44"
            >
                {close => (
                    <Command>
                        <CommandInput placeholder={t("administrationPlaceholder")} />
                        <CommandList>
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <AdminBodyOptions
                                bodyGroups={bodyGroups}
                                filters={filters}
                                setFilters={setFilters}
                                allBodiesLabel={tCommon("allBodies")}
                                onSelected={close}
                            />
                        </CommandList>
                    </Command>
                )}
            </FilterPill>

            <FilterPill
                label={t("party")}
                value={selectedParty ? getLocalizedShortName(selectedParty, locale) : null}
                icon={Users}
                disabled={disabled || !filters.cityId}
                clear={{
                    label: t("clearField", { field: t("party") }),
                    onClear: () => setFilters({ partyId: undefined, personId: undefined }),
                }}
                widthClassName="w-40"
            >
                {close => (
                    <Command>
                        <CommandInput placeholder={t("partyPlaceholder")} />
                        <CommandList>
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <CommandGroup>
                                {parties.map(party => (
                                    <FilterListItem
                                        key={party.id}
                                        searchValue={getLocalizedShortName(party, locale)}
                                        label={getLocalizedShortName(party, locale)}
                                        selected={filters.partyId === party.id}
                                        onSelect={() => {
                                            // The member pill is scoped to the party, so a
                                            // member of the previous one cannot survive.
                                            setFilters({ partyId: party.id, personId: undefined });
                                            close();
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </FilterPill>

            <FilterPill
                label={t("person")}
                value={personLabel}
                icon={User}
                disabled={disabled || !filters.cityId}
                clear={{
                    label: t("clearField", { field: t("person") }),
                    onClear: () => setFilters({ personId: undefined }),
                }}
                widthClassName="w-40"
            >
                {close => (
                    <Command>
                        <CommandInput placeholder={t("personPlaceholder")} />
                        <CommandList>
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <CommandGroup>
                                {availablePeople.map(member => (
                                    <FilterListItem
                                        key={member.id}
                                        searchValue={getLocalizedShortName(member, locale)}
                                        label={getLocalizedShortName(member, locale)}
                                        selected={filters.personId === member.id}
                                        onSelect={() => {
                                            // Adopt the member's party when none is set, so
                                            // the bar reads consistently and matches what
                                            // SearchPage reconciles from the URL anyway.
                                            setFilters({
                                                personId: member.id,
                                                partyId: filters.partyId ?? getPartyFromRoles(member.roles)?.id,
                                            });
                                            close();
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </FilterPill>

            <FilterPill
                label={t("type")}
                value={topicLabel}
                valueSuffix={topicSuffix}
                icon={Tag}
                disabled={disabled}
                clear={{
                    label: t("clearField", { field: t("type") }),
                    onClear: () => setFilters({ topicIds: undefined }),
                }}
                widthClassName="w-36"
            >
                {/* A compact list, not the card grid TopicFilter draws: 15 topics as
                    cards make a popover taller than the viewport and truncate the
                    longer names. One line per topic keeps every name readable and
                    matches the other pills. The panel stays open — topics are
                    multi-select — so no `close` here. */}
                {() => (
                    <Command>
                        <CommandInput placeholder={t("typePlaceholder")} />
                        <CommandList>
                            <CommandEmpty>
                                {topicsLoading ? t("loading") : topicsError ?? t("noOptions")}
                            </CommandEmpty>
                            <CommandGroup>
                                {topics.map(topic => {
                                    const selected = selectedTopicIds.includes(topic.id);
                                    return (
                                        <CommandItem
                                            key={topic.id}
                                            // Both names, so an English query finds a Greek-named topic.
                                            value={`${topic.name} ${topic.name_en}`}
                                            onSelect={() => {
                                                const next = selected
                                                    ? selectedTopicIds.filter(id => id !== topic.id)
                                                    : [...selectedTopicIds, topic.id];
                                                setFilters({ topicIds: next.length > 0 ? next.join(",") : undefined });
                                            }}
                                        >
                                            <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                                            <TopicIcon color={topic.colorHex} icon={topic.icon} size="sm" solid={selected} className="mr-2" />
                                            <span className="truncate">{getLocalizedName(topic, locale)}</span>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </FilterPill>

            <FilterPill
                label={t("date")}
                value={dateLabel}
                icon={CalendarDays}
                disabled={disabled}
                clear={{
                    label: t("clearField", { field: t("date") }),
                    onClear: () => applyDateRange(undefined),
                }}
                contentClassName="w-auto p-3"
                widthClassName="w-52"
            >
                {() => (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                            {DATE_PRESET_MONTHS.map(months => {
                                const active = activePresetMonths === months;
                                return (
                                    <Button
                                        key={months}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            "h-7 rounded-full px-2.5 text-xs font-normal",
                                            active
                                                ? "border-[hsl(var(--orange))]/40 bg-[hsl(var(--orange))]/10 text-foreground hover:bg-[hsl(var(--orange))]/15"
                                                : "text-muted-foreground"
                                        )}
                                        onClick={() => applyDateRange({ from: subMonths(new Date(), months), to: new Date() })}
                                    >
                                        {t("dateLastMonths", { count: months })}
                                    </Button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {t("dateOr")}
                            </span>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <DateRangePicker
                            value={dateRange}
                            onChange={applyDateRange}
                            placeholder={t("datePlaceholder")}
                            numberOfMonths={1}
                            disabled={date => date > new Date()}
                            className="h-8 text-xs"
                        />
                    </div>
                )}
            </FilterPill>
        </div>
    );
}
