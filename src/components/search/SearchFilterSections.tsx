"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Landmark, MapPin, User, Users, X } from "lucide-react";
import { cn, getPartyFromRoles } from "@/lib/utils";
import { getLocalizedName, getLocalizedShortName } from "@/lib/formatters/name";
import Icon from "@/components/icon";
import { topicStyle } from "@/lib/topicStyle";
import { Eyebrow } from "@/components/landing/v2/shared";
import { Command, CommandEmpty, CommandGroup, CommandList } from "@/components/ui/command";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { AdminBodyOptions, FilterListItem } from "./filterOptionList";
import { type SearchFilterData } from "./hooks/useSearchFilterData";
import { hasActiveSearchFilters, type FilterPatch, type SearchFilterParams } from "./searchFilterTypes";

/** Touch feedback the desktop popover rows don't need. */
const MOBILE_ITEM_CLASS = "active:bg-accent";

/** Which accordion section (if any) is expanded — the larger, city-scoped lists open one at a
 *  time so the panel doesn't grow to fit every list at once. */
type SectionKey = "city" | "administration" | "party" | "person";

/** Section header for an accordion filter (city / administration / party / person): icon, label,
 *  current value, a clear button when active, and a chevron that flips to show expanded state. */
function SectionHeader({
    label,
    value,
    icon: SectionIcon,
    disabled,
    expanded,
    onToggle,
    onClear,
    clearLabel,
}: {
    label: string;
    value: string | null;
    icon: typeof MapPin;
    disabled?: boolean;
    expanded: boolean;
    onToggle: () => void;
    onClear?: () => void;
    /** Accessible name for the clear button, e.g. "Clear city". Already localized. */
    clearLabel: string;
}) {
    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                disabled={disabled}
                onClick={onToggle}
                className={cn(
                    "flex flex-1 items-center gap-2 rounded-lg py-1 text-left transition-colors",
                    disabled && "cursor-not-allowed opacity-50"
                )}
            >
                <SectionIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-[15px] font-medium text-foreground">{label}</span>
                {value && <span className="min-w-0 truncate text-sm text-muted-foreground">{value}</span>}
                <ChevronDown
                    className={cn(
                        "ml-auto h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform",
                        expanded && "rotate-180"
                    )}
                    aria-hidden="true"
                />
            </button>
            {value && onClear && (
                <button
                    type="button"
                    onClick={onClear}
                    aria-label={clearLabel}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

/**
 * The /search page's filter fields — city, administrative body, party, person, topic and date
 * range — as a vertical, sectioned panel for the mobile full-screen filter overlay. The desktop
 * equivalent is SearchFilters (a row of pills); both share their data via useSearchFilterData.
 *
 * The lists here have no search input, unlike the desktop pills: on a phone it raises the
 * keyboard over the panel, and the lists are short enough to scroll instead. `value=""` on each
 * Command keeps cmdk from auto-highlighting the first row, which without an input reads as a
 * selection rather than a keyboard cursor.
 */
export default function SearchFilterSections({
    filters,
    setFilters,
    data,
    disabled = false,
    className,
}: {
    filters: SearchFilterParams;
    setFilters: (patch: FilterPatch) => void;
    /** Shared with the desktop bar — see SearchPage, which owns the one instance. */
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
        selectedCity,
        selectedParty,
        availablePeople,
        personLabel,
        bodyGroups,
        adminBodyLabel,
        dateRange,
        onCityChange,
        applyDateRange,
        clearAll,
    } = data;
    const [expanded, setExpanded] = useState<SectionKey | null>(null);
    const toggleSection = (key: SectionKey) => setExpanded(prev => (prev === key ? null : key));

    const dateActive = Boolean(filters.dateFrom);
    const anyFilterActive = hasActiveSearchFilters(filters);

    return (
        <div className={cn("flex flex-col", className)}>
            {anyFilterActive && (
                <button
                    type="button"
                    onClick={clearAll}
                    disabled={disabled}
                    className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("clear")}
                </button>
            )}

            {/* City — expands to reveal the list, like administration/party/person below. */}
            <SectionHeader
                label={t("city")}
                value={selectedCity ? getLocalizedName(selectedCity, locale) : null}
                icon={MapPin}
                disabled={disabled}
                expanded={expanded === "city"}
                onToggle={() => toggleSection("city")}
                onClear={selectedCity ? () => onCityChange(undefined) : undefined}
                    clearLabel={t("clearField", { field: t("city") })}
            />
            {expanded === "city" && (
                <Command value="" className="mb-1 mt-2 rounded-xl border border-border">
                    <CommandList className="max-h-56">
                        <CommandEmpty>{t("noOptions")}</CommandEmpty>
                        <CommandGroup>
                            {cities.map(city => (
                                <FilterListItem
                                    key={city.id}
                                    searchValue={getLocalizedName(city, locale)}
                                    label={getLocalizedName(city, locale)}
                                    selected={filters.cityId === city.id}
                                    className={MOBILE_ITEM_CLASS}
                                    onSelect={() => {
                                        onCityChange(city.id);
                                        setExpanded(null);
                                    }}
                                />
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            )}

            {/* The next three are city-scoped: disabled without a city rather than hidden, so the
                panel keeps one stable shape instead of growing as it is used. */}

            <div className="mt-3 border-t border-border pt-3">
                <SectionHeader
                    label={t("administration")}
                    value={adminBodyLabel}
                    icon={Landmark}
                    disabled={disabled || !filters.cityId || bodyGroups.length === 0}
                    expanded={expanded === "administration"}
                    onToggle={() => toggleSection("administration")}
                    onClear={adminBodyLabel ? () => setFilters({ adminBodyType: undefined, adminBodyId: undefined }) : undefined}
                    clearLabel={t("clearField", { field: t("administration") })}
                />
                {expanded === "administration" && (
                    <Command value="" className="mb-1 mt-2 rounded-xl border border-border">
                        <CommandList className="max-h-56">
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <AdminBodyOptions
                                bodyGroups={bodyGroups}
                                filters={filters}
                                setFilters={setFilters}
                                allBodiesLabel={tCommon("allBodies")}
                                itemClassName={MOBILE_ITEM_CLASS}
                                onSelected={() => setExpanded(null)}
                            />
                        </CommandList>
                    </Command>
                )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
                <SectionHeader
                    label={t("party")}
                    value={selectedParty ? getLocalizedShortName(selectedParty, locale) : null}
                    icon={Users}
                    disabled={disabled || !filters.cityId}
                    expanded={expanded === "party"}
                    onToggle={() => toggleSection("party")}
                    onClear={selectedParty ? () => setFilters({ partyId: undefined, personId: undefined }) : undefined}
                    clearLabel={t("clearField", { field: t("party") })}
                />
                {expanded === "party" && (
                    <Command value="" className="mb-1 mt-2 rounded-xl border border-border">
                        <CommandList className="max-h-56">
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <CommandGroup>
                                {parties.map(party => (
                                    <FilterListItem
                                        key={party.id}
                                        searchValue={getLocalizedShortName(party, locale)}
                                        label={getLocalizedShortName(party, locale)}
                                        selected={filters.partyId === party.id}
                                        className={MOBILE_ITEM_CLASS}
                                        onSelect={() => {
                                            // The member section is scoped to the party, so a
                                            // member of the previous one cannot survive.
                                            setFilters({ partyId: party.id, personId: undefined });
                                            setExpanded(null);
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
                <SectionHeader
                    label={t("person")}
                    value={personLabel}
                    icon={User}
                    disabled={disabled || !filters.cityId}
                    expanded={expanded === "person"}
                    onToggle={() => toggleSection("person")}
                    onClear={personLabel ? () => setFilters({ personId: undefined }) : undefined}
                    clearLabel={t("clearField", { field: t("person") })}
                />
                {expanded === "person" && (
                    <Command value="" className="mb-1 mt-2 rounded-xl border border-border">
                        <CommandList className="max-h-56">
                            <CommandEmpty>{t("noOptions")}</CommandEmpty>
                            <CommandGroup>
                                {availablePeople.map(member => (
                                    <FilterListItem
                                        key={member.id}
                                        searchValue={getLocalizedShortName(member, locale)}
                                        label={getLocalizedShortName(member, locale)}
                                        selected={filters.personId === member.id}
                                        className={MOBILE_ITEM_CLASS}
                                        onSelect={() => {
                                            // Adopt the member's party when none is set, so
                                            // the panel reads consistently and matches what
                                            // SearchPage reconciles from the URL anyway.
                                            setFilters({
                                                personId: member.id,
                                                partyId: filters.partyId ?? getPartyFromRoles(member.roles)?.id,
                                            });
                                            setExpanded(null);
                                        }}
                                    />
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </div>

            {/* Type — always-visible wrapped pills, same look as the landing page's category filter
                (topicStyle soft/solid) rather than another accordion: with ~15 topics it stays compact. */}
            <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                    <Eyebrow>{t("type")}</Eyebrow>
                    {selectedTopicIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setFilters({ topicIds: undefined })}
                            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                        >
                            {t("clear")}
                        </button>
                    )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {topicsLoading ? (
                        <span className="text-sm text-muted-foreground">{t("loading")}</span>
                    ) : topicsError ? (
                        <span className="text-sm text-muted-foreground">{topicsError}</span>
                    ) : topics.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t("noOptions")}</span>
                    ) : (
                        topics.map(topic => {
                            const active = selectedTopicIds.includes(topic.id);
                            const s = topicStyle(topic.colorHex, active ? "solid" : "soft");
                            return (
                                <button
                                    key={topic.id}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={active}
                                    onClick={() => {
                                        const next = active
                                            ? selectedTopicIds.filter(id => id !== topic.id)
                                            : [...selectedTopicIds, topic.id];
                                        setFilters({ topicIds: next.length > 0 ? next.join(",") : undefined });
                                    }}
                                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ backgroundColor: s.background, borderColor: s.border, color: s.icon }}
                                >
                                    <Icon name={topic.icon || "hash"} color={s.icon} size={14} />
                                    {getLocalizedName(topic, locale)}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Date range — always visible, matching the type section above. The desktop pill
                also offers "last N months" presets; on a narrow screen they crowded the panel,
                so this keeps the picker alone.

                contentClassName lifts the calendar over the filter overlay. The calendar is
                portalled to the body, so it is a sibling of the overlay rather than a child, and
                its own z-50 puts it under the opaque z-[60] overlay. It opened invisibly there,
                and it froze the panel with it: a modal popover takes pointer events off the body
                for as long as it is open. */}
            <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                    <Eyebrow>{t("date")}</Eyebrow>
                    {dateActive && (
                        <button
                            type="button"
                            onClick={() => applyDateRange(undefined)}
                            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                        >
                            {t("clear")}
                        </button>
                    )}
                </div>
                <DateRangePicker
                    value={dateRange}
                    onChange={applyDateRange}
                    placeholder={t("datePlaceholder")}
                    numberOfMonths={1}
                    disabled={date => date > new Date()}
                    className="mt-2.5 h-10 text-sm"
                    contentClassName="z-[70]"
                />
            </div>
        </div>
    );
}
