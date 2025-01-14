"use client"
import { Link } from "@/i18n/routing";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { FileIcon } from "lucide-react";
import { SubjectCard } from "../subject-card";
import { cn } from "@/lib/utils";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";

export function SubjectCards({ subjects, totalSubjects, fullWidth }: { subjects: (SubjectWithRelations & { statistics?: Statistics })[], totalSubjects?: number, fullWidth?: boolean }) {
    const { city, meeting, parties } = useCouncilMeetingData();
    return (
        <section className="w-full max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3 className="text-xl font-bold text-left flex items-center">
                    <FileIcon className="w-4 h-4 mr-2" />
                    {totalSubjects ? "Σημαντικότερα θέματα" : "Θέματα"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 sm:mt-0">
                    {totalSubjects ? (
                        <>{subjects.length} από <Link href="/subjects" className="underline hover:text-foreground">{totalSubjects} συνολικά θέματα</Link></>
                    ) : (
                        <>{subjects.length} θέματα</>
                    )}
                </p>
            </div>

            <div className={cn(
                "w-full",
                fullWidth
                    ? "space-y-4"
                    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            )}>
                {subjects.map(subject => (
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