"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { Layers, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SubjectRow } from "@/components/subject/SubjectRow";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { PersonWithRelations } from "@/lib/db/people";
import type { RelatedScope, SearchResultLight } from "@/lib/search/types";
import type { Statistics } from "@/lib/statistics";

/** One level of related subjects, with everything a row draws. */
export interface RelatedLevel {
    subjects: (SearchResultLight & { statistics?: Statistics })[];
    /** The people the rows show on their avatar rows — introducers and top speakers. */
    persons: PersonWithRelations[];
}

interface RelatedSubjectsProps {
    subjectId: string;
    subjectName: string;
    meetingId: string;
    cityId: string;
    /** The subject's municipality, already localized — the label of the first pill. */
    cityName: string;
    /** Both levels, loaded by the server half (RelatedSubjectsSection). */
    levels: Record<RelatedScope, RelatedLevel>;
}

const SCOPES: RelatedScope[] = ['city', 'other'];

/**
 * The two levels as a pair of filter pills — the search page's own vocabulary
 * for "what the list is narrowed to": the chosen one carries the orange tint
 * of an active filter (FilterPill), the other rests as an unset one.
 */
function ScopePills({ value, options, label, onChange }: {
    value: RelatedScope;
    options: { value: RelatedScope; label: string }[];
    /** The group's accessible name: the pills alone do not say what they choose between. */
    label: string;
    onChange: (value: RelatedScope) => void;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
            {options.map(option => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
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
 * decides whether the section exists at all. Here only the level is chosen:
 * no pills when one level has nothing — the rows name their municipality
 * themselves — and the first level with subjects otherwise.
 */
export function RelatedSubjects({ subjectId, subjectName, meetingId, cityId, cityName, levels }: RelatedSubjectsProps) {
    const t = useTranslations("Subject");
    const [selected, setSelected] = useState<RelatedScope>('city');

    const available = SCOPES.filter(scope => levels[scope].subjects.length > 0);
    const scope = available.includes(selected) ? selected : available[0];
    const { subjects, persons } = levels[scope];

    const handleScopeChange = (value: RelatedScope) => {
        if (value === scope) return;
        setSelected(value);
        posthog.capture("related_subjects_scope_changed", {
            subject_id: subjectId,
            city_id: cityId,
            meeting_id: meetingId,
            scope: value,
        });
    };

    const searchHref = scope === 'city'
        ? `/search?query=${encodeURIComponent(subjectName)}&cityId=${encodeURIComponent(cityId)}`
        : `/search?query=${encodeURIComponent(subjectName)}`;

    return (
        <CollapsibleCard
            icon={<Layers className="w-4 h-4" />}
            title={t("relatedSubjects")}
            defaultOpen={true}
        >
            <div className="flex flex-col gap-4 p-4">
                {available.length > 1 && (
                    <ScopePills
                        value={scope}
                        label={t("relatedScopeLabel")}
                        onChange={handleScopeChange}
                        options={[
                            { value: 'city', label: cityName },
                            { value: 'other', label: t("relatedOtherCities") },
                        ]}
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
                            onOpen={() => posthog.capture("related_subject_opened", {
                                subject_id: subjectId,
                                related_subject_id: related.id,
                                related_city_id: related.cityId,
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
