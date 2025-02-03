"use client"
import { Link } from "@/i18n/routing";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { FileIcon } from "lucide-react";
import { SubjectCard } from "../subject-card";
import { cn } from "@/lib/utils";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { MultiSelectDropdown, Option } from "@/components/ui/multi-select-dropdown";
import { useState } from "react";

type FilterType = "agenda" | "non-agenda";

const filterOptions: Option<FilterType>[] = [
    { value: "agenda", label: "Ημερησίας Διάταξης" },
    { value: "non-agenda", label: "Εκτός και προ ημερησίας" },
];

export function SubjectCards({ subjects, totalSubjects, fullWidth }: { subjects: (SubjectWithRelations & { statistics?: Statistics })[], totalSubjects?: number, fullWidth?: boolean }) {
    const { city, meeting, parties } = useCouncilMeetingData();
    const [selectedFilters, setSelectedFilters] = useState<FilterType[]>([]);

    // Filter and sort subjects based on selected filter
    const filteredSubjects = subjects.filter(subject => {
        if (selectedFilters.length === 0) return true; // Show all when no filters selected
        if (selectedFilters.includes("agenda") && subject.agendaItemIndex !== null) return true;
        if (selectedFilters.includes("non-agenda") && subject.agendaItemIndex === null) return true;
        return false;
    }).sort((a, b) => {
        // Only sort by agendaItemIndex when viewing agenda items
        if (selectedFilters.includes("agenda") && a.agendaItemIndex !== null && b.agendaItemIndex !== null) {
            return a.agendaItemIndex - b.agendaItemIndex;
        }
        return 0;
    });

    const handleFilterChange = (values: FilterType[]) => {
        setSelectedFilters(values);
    };

    return (
        <section className="w-full max-w-4xl mx-auto mt-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="text-xl font-bold text-left flex items-center">
                    <FileIcon className="w-4 h-4 mr-2" />
                    Θέματα
                </h3>
                <div className="flex items-center gap-4">
                    <MultiSelectDropdown
                        options={filterOptions}
                        defaultValues={filterOptions.map(option => option.value)}
                        onChange={handleFilterChange}
                        className="w-[320px] h-9 px-3 justify-between"
                        placeholder="Επιλέξτε φίλτρο"
                    />
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