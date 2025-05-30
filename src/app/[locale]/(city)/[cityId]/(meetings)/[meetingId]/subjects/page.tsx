"use client"
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectCards } from "@/components/meetings/subject-cards";
import { sortSubjectsByImportance } from "@/lib/utils";
import { useState } from "react";
import { ListOrderedIcon, TrendingUpIcon, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SubjectsPage() {
    const { meeting, subjects } = useCouncilMeetingData();
    const [orderBy, setOrderBy] = useState<'importance' | 'appearance'>('importance');

    const sortedSubjects = sortSubjectsByImportance(subjects, orderBy);

    return (
        <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 px-4 pb-1">
                <h3 className="text-xl font-bold flex items-center mb-4 sm:mb-0">
                    <FileIcon className="w-5 h-5 mr-2" />
                    Θέματα
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {subjects.length} θέματα
                    </span>
                </h3>

                <div className="bg-muted/50 rounded-lg p-1 flex w-full sm:w-auto border">
                    <button
                        onClick={() => setOrderBy('importance')}
                        className={cn(
                            "flex items-center justify-center gap-2 px-4 py-2 flex-1 text-sm font-medium rounded-md transition-all",
                            orderBy === 'importance'
                                ? "bg-primary/10 text-primary shadow-sm hover:bg-primary/15"
                                : "text-muted-foreground hover:bg-muted"
                        )}
                    >
                        <TrendingUpIcon className="w-4 h-4" />
                        <span>Πιο πολυσυζητημένα πρώτα</span>
                    </button>
                    <button
                        onClick={() => setOrderBy('appearance')}
                        className={cn(
                            "flex items-center justify-center gap-2 px-4 py-2 flex-1 text-sm font-medium rounded-md transition-all",
                            orderBy === 'appearance'
                                ? "bg-primary/10 text-primary shadow-sm hover:bg-primary/15"
                                : "text-muted-foreground hover:bg-muted"
                        )}
                    >
                        <ListOrderedIcon className="w-4 h-4" />
                        <span>Σειρά εμφάνισης</span>
                    </button>
                </div>
            </div>

            <SubjectCards subjects={sortedSubjects} fullWidth />
        </div>
    );
}