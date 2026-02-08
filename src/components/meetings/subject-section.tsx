"use client"
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { SubjectCard } from "../subject-card";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useState } from "react";
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
    const { city, meeting, parties, people } = useCouncilMeetingData();
    const [showExplainer, setShowExplainer] = useState(false);
    const [showAll, setShowAll] = useState(false);

    if (subjects.length === 0) return null;

    const hasMore = subjects.length > INITIAL_VISIBLE;
    const visibleSubjects = showAll ? subjects : subjects.slice(0, INITIAL_VISIBLE);

    // When few subjects, cards stack vertically; otherwise use multi-column grid
    const cardGridClass = subjects.length <= 2
        ? "flex flex-col gap-4 flex-1"
        : "flex flex-wrap gap-4 flex-1 [&>*]:w-full [&>*]:sm:w-[calc(50%-0.5rem)] [&>*]:lg:w-[calc(33.333%-0.75rem)] [&>*]:lg:min-w-[calc(33.333%-0.75rem)]";

    return (
        <section className={cn("mt-8 flex flex-col", className ?? "w-full max-w-4xl mx-auto")}>
            <div className="flex flex-col gap-3 mb-5">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-base sm:text-lg font-bold">{title}</h3>
                        <button
                            onClick={() => setShowExplainer(!showExplainer)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            aria-label="Τι σημαίνει αυτό;"
                        >
                            <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs sm:text-sm text-muted-foreground ml-auto">
                            {subjects.length} {subjects.length === 1 ? "θέμα" : "θέματα"}
                        </span>
                    </div>

                    {showSortToggle && onSortModeChange && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm mt-1">
                            <button
                                onClick={() => onSortModeChange('speakingTime')}
                                className={cn(
                                    "transition-colors",
                                    sortMode === 'speakingTime'
                                        ? "text-primary underline underline-offset-4"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Πιο πολυσυζητημένα
                            </button>
                            <span className="text-muted-foreground/40">|</span>
                            <button
                                onClick={() => onSortModeChange('agendaIndex')}
                                className={cn(
                                    "transition-colors",
                                    sortMode === 'agendaIndex'
                                        ? "text-primary underline underline-offset-4"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Σειρά διάταξης
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

            <div className={cardGridClass}>
                {visibleSubjects.map(subject => (
                    <SubjectCard
                        key={subject.id}
                        subject={subject}
                        city={city}
                        meeting={meeting}
                        parties={parties}
                        persons={people}
                    />
                ))}
            </div>

            {hasMore && !showAll && (
                <div className="flex justify-center mt-4">
                    <button
                        onClick={() => setShowAll(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Εμφάνιση όλων ({subjects.length})
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            )}
        </section>
    );
}
