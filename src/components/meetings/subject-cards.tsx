"use client"
import { Link } from "@/i18n/routing";
import { SubjectWithRelations } from "@/lib/db/subject";
import { Statistics } from "@/lib/statistics";
import { FileIcon } from "lucide-react";
import { SubjectCard } from "../subject-card";
import { cn } from "@/lib/utils";

export function SubjectCards({ subjects, totalSubjects, fullWidth }: { subjects: (SubjectWithRelations & { statistics?: Statistics })[], totalSubjects?: number, fullWidth?: boolean }) {
    return (
        <div className={cn("p-6", fullWidth && "w-full")}>
            <section className="w-full max-w-4xl mx-auto">
                <h3 className="text-xl font-bold text-left">
                    <FileIcon className="w-4 h-4 inline-block mr-2" />
                    {totalSubjects ? (
                        <>Σημαντικότερα θέματα</>
                    ) : (
                        <>Θέματα</>
                    )}
                </h3>
                <p className="text-sm text-muted-foreground">
                    {totalSubjects ? (
                        <>{subjects.length} από <Link href="/subjects" className="underline hover:text-foreground">{totalSubjects} συνολικά θέματα</Link></>
                    ) : (
                        <>{subjects.length} θέματα</>
                    )}
                </p>

                <div className={cn("flex flex-wrap gap-4 mt-4", fullWidth && "flex-col")}>
                    {subjects.map(subject => <SubjectCard key={subject.id} subject={subject} fullWidth={fullWidth} />)}
                </div>

                {/*
                <div className="w-full relative flex flex-col items-center justify-center overflow-hidden rounded-lg">
                    <Marquee pauseOnHover repeat={3} className="[--duration:20s]">
                        {subjects.map(subject => <SubjectCard key={subject.id} subject={subject} />)}
                    </Marquee>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white dark:from-background"></div>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white dark:from-background"></div>
                </div>
                */}
            </section>
        </div>
    )
}