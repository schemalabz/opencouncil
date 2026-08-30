"use client"
import { SubjectWithRelations } from "@/lib/db/subject";
import { captureEvent } from '@/lib/analytics/capture';
import { Statistics } from "@/lib/statistics";
import { SubjectRow } from "../subject/SubjectRow";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { HelpCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE = 3;

interface SubjectSectionProps {
    title: string;
    explainerText: string;
    subjects: (SubjectWithRelations & { statistics?: Statistics })[];
    sortMode?: 'speakingTime' | 'agendaIndex';
    onSortModeChange?: (mode: 'speakingTime' | 'agendaIndex') => void;
    showSortToggle?: boolean;
    className?: string;
}

export function SubjectSection({
    title,
    explainerText,
    subjects,
    sortMode,
    onSortModeChange,
    showSortToggle,
    className,
}: SubjectSectionProps) {
    const { city, meeting, people } = useCouncilMeetingData();
    const t = useTranslations("Subject");
    const [showExplainer, setShowExplainer] = useState(false);
    const [showAll, setShowAll] = useState(false);

    if (subjects.length === 0) return null;

    const hasMore = subjects.length > INITIAL_VISIBLE;
    const visibleSubjects = showAll ? subjects : subjects.slice(0, INITIAL_VISIBLE);


    return (
        <section className={cn("mt-8 flex flex-col", className ?? "w-full max-w-4xl mx-auto")}>
            <div className="flex flex-col gap-3 mb-5">
                <div>
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <h3 className="text-base sm:text-lg font-bold">{title}</h3>
                        <button
                            onClick={() => setShowExplainer(!showExplainer)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 self-center"
                            aria-label={t("whatIsThis")}
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs sm:text-sm text-muted-foreground ml-auto">
                            {t("count", { count: subjects.length })}
                        </span>
                    </div>

                    {showSortToggle && onSortModeChange && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm mt-1">
                            <button
                                onClick={() => {
                                    captureEvent('meeting_page_action', { action: 'sort_discussed', city_id: city.id, meeting_id: meeting.id });
                                    onSortModeChange('speakingTime');
                                }}
                                className={cn(
                                    "transition-colors",
                                    sortMode === 'speakingTime'
                                        ? "text-primary underline underline-offset-4"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t("sortByMostDiscussed")}
                            </button>
                            <span className="text-muted-foreground/40">|</span>
                            <button
                                onClick={() => {
                                    captureEvent('meeting_page_action', { action: 'sort_agenda', city_id: city.id, meeting_id: meeting.id });
                                    onSortModeChange('agendaIndex');
                                }}
                                className={cn(
                                    "transition-colors",
                                    sortMode === 'agendaIndex'
                                        ? "text-primary underline underline-offset-4"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t("sortByAgendaOrder")}
                            </button>
                        </div>
                    )}
                </div>

                {showExplainer && (
                    <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                        {explainerText}
                    </p>
                )}
            </div>

            {/* Rows, not tiles: the search page's own subject row, minus the context
                line a meeting page already provides. A list reads top to bottom and
                gives every title a full measure — the three-across tiles clamped
                theirs to a third of the column. */}
            <div className="flex flex-col gap-3">
                {visibleSubjects.map(subject => (
                    <SubjectRow
                        key={subject.id}
                        subject={subject}
                        city={city}
                        meeting={meeting}
                        persons={people}
                        showContext={false}
                        onOpen={() => captureEvent('subject_opened', {
                            surface: 'meeting_rows',
                            subject_id: subject.id,
                            city_id: city.id,
                            meeting_id: meeting.id,
                            sort_mode: sortMode ?? null,
                        })}
                    />
                ))}
            </div>

            {hasMore && !showAll && (
                <div className="flex justify-center mt-4">
                    <button
                        onClick={() => {
                            captureEvent('meeting_page_action', { action: 'show_all_subjects', city_id: city.id, meeting_id: meeting.id, count: subjects.length });
                            setShowAll(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {t("showAll", { count: subjects.length })}
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            )}
        </section>
    );
}
