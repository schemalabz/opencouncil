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
    mostRecent?: boolean;
}

export default function MeetingCard({ item: meeting, editable, mostRecent }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = () => {
        setIsLoading(true);
        router.push(`/${meeting.cityId}/${meeting.id}`);
    };

    const remainingSubjectsCount = meeting.subjects.length - 3;

    const getMediaStatus = () => {
        if (meeting.videoUrl) return t('withVideo');
        if (meeting.audioUrl) return t('withAudio');
        return t('noVideo');
    };

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:scale-[1.01] cursor-pointer"
            )}
            onClick={handleClick}
        >
            {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : (
                <CardContent className="relative h-full flex flex-col p-4 sm:p-6">
                    <div className="space-y-3 sm:space-y-4 flex-grow">
                        <div className="space-y-2">
                            <h3 className="text-lg sm:text-xl font-bold group-hover:text-primary transition-colors line-clamp-2">
                                {meeting.name}
                            </h3>
                            <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {format(meeting.dateTime, 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS })}
                                </div>
                                <div className="flex items-center gap-1">
                                    <VideoIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {getMediaStatus()}
                                </div>
                                <div className="flex items-center gap-1">
                                    <FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {meeting.subjects.length} {t('subjects')}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                            {meeting.subjects.slice(0, 3).map((subject) => (
                                <SubjectBadge
                                    key={subject.id}
                                    subject={subject}
                                    className="text-xs"
                                />
                            ))}
                            {remainingSubjectsCount > 0 && (
                                <Link
                                    href={`/${meeting.cityId}/${meeting.id}/subjects`}
                                    className="text-xs sm:text-sm text-muted-foreground hover:text-primary"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {t('moreSubjects', { count: remainingSubjectsCount })}
                                </Link>
                            )}
                        </div>
                    </div>

                    {mostRecent && (
                        <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-medium">
                            {t('mostRecent')}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
