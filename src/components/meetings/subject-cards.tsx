"use client"
import { Link } from "@/i18n/routing";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { FileIcon } from "lucide-react";
import { SubjectCard } from "../subject-card";
import { cn } from "@/lib/utils";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { MultiSelectDropdown, Option } from "@/components/ui/multi-select-dropdown";
import { useState, useMemo } from "react";
import { TopicFilter } from "@/components/TopicFilter";
import { Topic } from "@prisma/client";

type FilterType = "agenda" | "beforeAgenda" | "outOfAgenda";

const filterOptions: Option<FilterType>[] = [
    { value: "agenda", label: "Ημερησίας Διάταξης" },
    { value: "beforeAgenda", label: "Προ ημερησίας" },
    { value: "outOfAgenda", label: "Εκτός ημερησίας" },
];

export function SubjectCards({ subjects, totalSubjects, fullWidth }: { subjects: (SubjectWithRelations & { statistics?: Statistics })[], totalSubjects?: number, fullWidth?: boolean }) {
    const { city, meeting, parties, people } = useCouncilMeetingData();
    const [selectedFilters, setSelectedFilters] = useState<FilterType[]>([]);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

    // Extract unique topics from the subjects list
    const availableTopics = useMemo(() => {
        const topicsMap = new Map<string, Topic>();
        subjects.forEach(subject => {
            if (subject.topic) {
                topicsMap.set(subject.topic.id, subject.topic);
            }
        });
        return Array.from(topicsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [subjects]);

    // Filter and sort subjects based on selected filters and topic
    const filteredSubjects = subjects.filter(subject => {
        // Filter by topic
        if (selectedTopicId && subject.topic?.id !== selectedTopicId) return false;

        // Filter by type
        if (selectedFilters.length === 0) return true; // By default, show all topics

        if (selectedFilters.includes("agenda") && subject.agendaItemIndex !== null) return true;
        if (selectedFilters.includes("beforeAgenda") && subject.nonAgendaReason === 'beforeAgenda') return true;
        if (selectedFilters.includes("outOfAgenda") && subject.nonAgendaReason === 'outOfAgenda') return true;

        return false;
    }).sort((a, b) => {
        // Sort by agendaItemIndex when viewing agenda items
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
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-bold text-left flex items-center mb-2 sm:mb-0">
                        <FileIcon className="w-4 h-4 mr-2" />
                        Θέματα
                    </h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <MultiSelectDropdown
                            options={filterOptions}
                            defaultValues={filterOptions.map(option => option.value)}
                            onChange={handleFilterChange}
                            className="w-full sm:w-[280px] h-9 px-3 justify-between"
                            placeholder="Επιλέξτε τύπο"
                        />
                        <p className="text-sm text-muted-foreground whitespace-nowrap">
                            {totalSubjects ? (
                                <>{filteredSubjects.length} από <Link href={`/${city.id}/${meeting.id}/subjects`} className="underline hover:text-foreground">{totalSubjects} συνολικά</Link></>
                            ) : (
                                <>{filteredSubjects.length} θέματα</>
                            )}
                        </p>
                    </div>
                </div>

                {/* Topic Filter */}
                {availableTopics.length > 0 && (
                    <TopicFilter 
                        topics={availableTopics}
                        selectedTopicId={selectedTopicId}
                        onSelectTopic={setSelectedTopicId}
                        className="my-2"
                    />
                )}
            </div>

            <div className={cn(
                "w-full",
                fullWidth
                    ? "space-y-4"
                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            )}>
                {filteredSubjects.length > 0 ? (
                    filteredSubjects.map(subject => (
                        <SubjectCard
                            key={subject.id}
                            subject={subject}
                            city={city}
                            meeting={meeting}
                            parties={parties}
                            persons={people}
                            fullWidth={fullWidth}
                        />
                    ))
                ) : (
                    <div className="col-span-full text-center py-12 border rounded-lg border-dashed bg-muted/30">
                        <p className="text-muted-foreground">Δεν βρέθηκαν θέματα με τα επιλεγμένα φίλτρα</p>
                    </div>
                )}
            </div>
        </section>
    )
}