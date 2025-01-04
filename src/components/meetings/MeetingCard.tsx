'use client'
import { CouncilMeeting, Subject, Topic } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { StatisticsOfCouncilMeeting, Statistics } from '@/lib/statistics';
import { CalendarIcon, FileIcon, Loader2, VideoIcon } from 'lucide-react';
import { sortSubjectsByImportance } from '@/lib/utils';
import SubjectBadge from '../subject-badge';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';

interface MeetingCardProps {
    item: CouncilMeeting & { subjects: (Subject & { topic?: Topic | null })[] };
    editable: boolean;
}

type MeetingStatistics = StatisticsOfCouncilMeeting & {
    subjects: (Subject & { topic?: Topic | null, statistics?: Statistics })[];
};

export default function MeetingCard({ item: meeting, editable }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const [statistics, setStatistics] = useState<MeetingStatistics | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);
        router.push(`/${meeting.cityId}/${meeting.id}`);
    };

    useEffect(() => {
        if (meeting.subjects.length > 0) {
            import('@/lib/statistics').then(({ getStatisticsFor }) => {
                Promise.all(meeting.subjects.map(subject =>
                    getStatisticsFor({ subjectId: subject.id }, ['person', 'party'])
                )).then(stats => {
                    const subjectsWithStats = meeting.subjects.map((subject, i) => ({
                        ...subject,
                        statistics: stats[i]
                    }));
                    setStatistics({
                        ...stats[0],
                        subjects: subjectsWithStats
                    } as MeetingStatistics);
                });
            });
        }
    }, [meeting.subjects]);

    const importantSubjects = statistics?.subjects ?
        sortSubjectsByImportance(statistics.subjects)
            .slice(0, 3) : [];

    const remainingSubjectsCount = meeting.subjects.length - 3;

    return (
        <Card
            className={cn(
                "group relative h-64 overflow-hidden transition-all duration-300 hover:shadow-lg cursor-pointer",
                "hover:scale-[1.02]"
            )}
            onClick={handleClick}
        >
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : (
                <CardContent className="relative h-full flex flex-col justify-between p-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-bold group-hover:text-primary transition-colors">
                                {meeting.name}
                            </h3>
                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <CalendarIcon className="w-4 h-4" />
                                    {format(meeting.dateTime, 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS })}
                                </div>
                                <div className="flex items-center gap-1">
                                    <VideoIcon className="w-4 h-4" />
                                    {meeting.videoUrl ? "Με βίντεο" : meeting.audioUrl ? "Ήχος" : "Χωρίς μέσα"}
                                </div>
                                <div className="flex items-center gap-1">
                                    <FileIcon className="w-4 h-4" />
                                    {meeting.subjects.length} θέματα
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            {importantSubjects.map((subject) => (
                                <SubjectBadge
                                    key={subject.id}
                                    subject={subject}
                                    className="-mt-0"
                                />
                            ))}
                            {remainingSubjectsCount > 0 && (
                                <Link
                                    href={`/${meeting.cityId}/${meeting.id}/subjects`}
                                    className="text-sm text-muted-foreground hover:text-primary"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    και άλλα {remainingSubjectsCount} θέματα
                                </Link>
                            )}
                        </div>
                    </div>

                </CardContent>
            )}
        </Card>
    );
}
