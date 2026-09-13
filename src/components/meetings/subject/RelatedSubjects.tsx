"use client";

import { useState } from "react";
import { Layers, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SubjectRow } from "@/components/subject/SubjectRow";
import { buildSearchHref } from "@/components/search/searchFilterTypes";
import { useLocalizeText } from "@/hooks/useLocalizeText";
import { Link } from "@/i18n/routing";
import { captureEvent } from "@/lib/analytics/capture";
import { cn } from "@/lib/utils";
import type { PersonWithRelations } from "@/lib/db/people";
import type { RelatedScope, SearchResultLight } from "@/lib/search/types";
import type { Statistics } from "@/lib/statistics";

/** One level of related subjects, with everything a row draws. */
export interface RelatedLevel {
    scope: RelatedScope;
    subjects: (SearchResultLight & { statistics?: Statistics })[];
    /** The people the rows show on their avatar rows — introducers and top speakers. */
    persons: PersonWithRelations[];
}

/** The levels with subjects, in scope order. Never empty: the server half renders nothing instead. */
export type RelatedLevels = [RelatedLevel, ...RelatedLevel[]];

interface RelatedSubjectsProps {
    subjectId: string;
    subjectName: string;
    meetingId: string;
    cityId: string;
    /** The subject's municipality, already localized — the label of the first pill. */
    cityName: string;
    levels: RelatedLevels;
}

/**
 * The levels as a pair of filter pills — the search page's own vocabulary
 * for "what the list is narrowed to": the chosen one carries the orange tint
 * of an active filter (FilterPill), the other rests as an unset one. Toggle
 * buttons rather than radios: `aria-pressed` says which is on, and native
 * buttons already give each pill its key handling.
 */
function ScopePills({ value, options, label, onChange }: {
    value: RelatedScope;
    options: { value: RelatedScope; label: string }[];
    /** The group's accessible name: the pills alone do not say what they choose between. */
    label: string;
    onChange: (value: RelatedScope) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
            {options.map(option => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "inline-flex h-9 items-center rounded-full border px-3.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            active
                                ? "border-[hsl(var(--orange))]/40 bg-[hsl(var(--orange))]/5 font-medium text-foreground"
                                : "border-input bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * The subjects most similar to this one, at two levels: the same municipality
 * and every other municipality. The rows are the search page's rows, so a
 * reader who knows one knows the other. The button at the end opens the
 * search with the subject's own title as the query.
 *
 * The data arrives from the server (RelatedSubjectsSection), which also
 * decides whether the section exists at all and passes only the levels with
 * subjects. Here only the level is chosen: no pills when there is one level
 * — the rows name their municipality themselves — and the first level
 * otherwise.
 */
export function RelatedSubjects({ subjectId, subjectName, meetingId, cityId, cityName, levels }: RelatedSubjectsProps) {
    const t = useTranslations("Subject");
    const localize = useLocalizeText();
    const [selected, setSelected] = useState<RelatedScope>(levels[0].scope);

    const { scope, subjects, persons } = levels.find(level => level.scope === selected) ?? levels[0];

    const handleScopeChange = (value: RelatedScope) => {
        if (value === scope) return;
        setSelected(value);
        captureEvent("related_subjects_scope_changed", {
            subject_id: subjectId,
            city_id: cityId,
            meeting_id: meetingId,
            scope: value,
        });
    };

    // The search box shows the query, so it carries the title in the reader's
    // script; the index was asked with the authored one.
    const searchHref = buildSearchHref({
        query: localize(subjectName),
        ...(scope === 'city' && { cityId }),
    });

    const labels: Record<RelatedScope, string> = { city: cityName, other: t("relatedOtherCities") };

    return (
        <CollapsibleCard
            icon={<Layers className="w-4 h-4" />}
            title={t("relatedSubjects")}
            defaultOpen={true}
        >
            <div className="flex flex-col gap-4 p-4">
                {levels.length > 1 && (
                    <ScopePills
                        value={scope}
                        label={t("relatedScopeLabel")}
                        onChange={handleScopeChange}
                        options={levels.map(level => ({ value: level.scope, label: labels[level.scope] }))}
                    />
                )}

                <div className="flex flex-col gap-4">
                    {subjects.map((related, index) => (
                        <SubjectRow
                            key={related.id}
                            subject={related}
                            city={related.councilMeeting.city}
                            meeting={related.councilMeeting}
                            persons={persons}
                            showContext={true}
                            onOpen={() => captureEvent("subject_opened", {
                                surface: 'related_subjects',
                                subject_id: related.id,
                                city_id: related.cityId,
                                meeting_id: related.councilMeetingId,
                                from_subject_id: subjectId,
                                scope,
                                rank: index,
                            })}
                        />
                    ))}
                </div>

                <div className="flex justify-end">
                    <Button asChild variant="outline" size="sm">
                        <Link href={searchHref}>
                            <Search className="h-4 w-4 mr-2" aria-hidden="true" />
                            {t("relatedSeeMore")}
                        </Link>
                    </Button>
                </div>
            </div>
        </CollapsibleCard>
    );
}
