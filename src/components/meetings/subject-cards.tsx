"use client"
import { Link } from "@/i18n/routing";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { FileIcon } from "lucide-react";
import { SubjectCard } from "../subject-card";
import { cn } from "@/lib/utils";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useState } from "react";

type FilterType = "all" | "agenda" | "non-agenda";

export function SubjectCards({ subjects, totalSubjects, fullWidth }: { subjects: (SubjectWithRelations & { statistics?: Statistics })[], totalSubjects?: number, fullWidth?: boolean }) {
    const { city, meeting, parties } = useCouncilMeetingData();
    const [filter, setFilter] = useState<FilterType>("all");

    // Filter and sort subjects based on selected filter
    const filteredSubjects = subjects.filter(subject => {
        if (filter === "all") return true;
        if (filter === "agenda") return subject.agendaItemIndex !== null;
        return subject.agendaItemIndex === null; // non-agenda
    }).sort((a, b) => {
        // Only sort by agendaItemIndex when viewing agenda items
        if (filter === "agenda" && a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
            return a.agendaItemIndex - b.agendaItemIndex;
        }
        return 0;
    });

    return (
        <section className="w-full max-w-4xl mx-auto mt-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="text-xl font-bold text-left flex items-center">
                    <FileIcon className="w-4 h-4 mr-2" />
                    Θέματα
                </h3>
                <div className="flex items-center gap-4">
                    <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
                        <SelectTrigger className="w-[320px] h-9 px-3">
                            <SelectValue placeholder="Επιλέξτε φίλτρο" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="py-2">Όλα</SelectItem>
                            <SelectItem value="agenda" className="py-2">Ημερησίας Διάταξης</SelectItem>
                            <SelectItem value="non-agenda" className="py-2">Εκτός και προ ημερησίας</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        {totalSubjects ? (
                            <>{filteredSubjects.length} από <Link href={`/${city.id}/${meeting.id}/subjects`} className="underline hover:text-foreground">{totalSubjects} συνολικά θέματα</Link></>
                        ) : (
                            <>{filteredSubjects.length} θέματα</>
                        )}
                    </p>
                </div>
            </div>

            <div className={cn(
                "w-full",
                fullWidth
                    ? "space-y-4"
                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            )}>
                {filteredSubjects.map(subject => (
                    <SubjectCard
                        key={subject.id}
                        subject={subject}
                        city={city}
                        meeting={meeting}
                        parties={parties}
                        fullWidth={fullWidth}
                    />
                ))}
            </div>
        </section>
    )
}