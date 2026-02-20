'use client'
import { CouncilMeeting, Subject, Topic, AdministrativeBody } from '@prisma/client';
import { useRouter, usePathname } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useState, useMemo } from 'react';
import { format, formatDistanceToNow, isFuture } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { CalendarIcon, Clock, Loader2, ChevronRight, Building } from 'lucide-react';
import { sortSubjectsByImportance, formatDateTime, formatDate, IS_DEV } from '@/lib/utils';
import SubjectBadge from '../subject-badge';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Badge } from '../ui/badge';
import { motion } from 'framer-motion';

// Helper function for development-only logs
const logDev = (message: string, data?: any) => {
    if (IS_DEV) {
        console.log(`[Dev] ${message}`, data || '');
    }
};

interface MeetingCardProps {
    item: CouncilMeeting & {
        subjects: (Subject & {
            topic?: Topic | null,
            speakerSegments?: any[] // Using any for flexibility with the structure
        })[],
        administrativeBody?: AdministrativeBody | null
    };
    editable: boolean;
    mostRecent?: boolean;
    cityTimezone?: string;
}

const LoadingDots = () => (
    <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
            <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                animate={{
                    opacity: [0.3, 1, 0.3],
                    scale: [0.8, 1, 0.8],
                }}
                transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                }}
            />
        ))}
    </div>
);

export default function MeetingCard({ item: meeting, editable, mostRecent, cityTimezone }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const pathname = usePathname();
    const [isLoading, setIsLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        setIsLoading(false);
    }, [pathname]);

    // Since data comes from the backend as ordered by hot status already (due to db query order),d
    // we maintain that order but use our utility for consistency
    const sortedSubjects = useMemo(() => {
        const result = sortSubjectsByImportance(meeting.subjects, 'importance');

        // Debug logs to help understand the sorting
        if (result.length > 0) {
            const topThree = result.slice(0, Math.min(3, result.length));
            logDev('MeetingCard - Subject Sorting', {
                meetingId: meeting.id,
                meetingName: meeting.name,
                totalSubjects: result.length,
                topSubjects: topThree.map(s => ({
                    id: s.id,
                    name: s.name,
                    isHot: s.hot,
                    segmentCount: s.speakerSegments?.length || 0,
                    agendaItemIndex: s.agendaItemIndex,
                    hasTopic: !!s.topic
                }))
            });
        }

        return result;
    }, [meeting.subjects, meeting.id, meeting.name]);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await router.push(`/${meeting.cityId}/${meeting.id}`);
    };

    const remainingSubjectsCount = meeting.subjects.length - 3;
    const isUpcoming = isFuture(meeting.dateTime);
    const isToday = format(meeting.dateTime, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    const isTodayWithoutVideo = isToday && !meeting.videoUrl;

    // Ensure we have subjects to display
    const hasSubjects = meeting.subjects.length > 0;

    return (
        <motion.div
            className="h-full"
            whileHover={{ scale: 1.01 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
        >
            <Card
                className={cn(
                    "relative h-full overflow-hidden transition-all duration-300 group flex flex-col",
                    "hover:shadow-lg hover:shadow-[#a4c0e1]/20 cursor-pointer",
                    mostRecent ? "border-0" : "border-0"
                )}
                onClick={handleClick}
            >
                <CardContent className="p-0 flex flex-col h-full">
                    {/* Loading overlay */}
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 left-0 top-0 flex items-center justify-center bg-background/90 backdrop-blur-sm z-20"
                        >
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <span className="text-sm text-muted-foreground animate-pulse">
                                    {t('loading')}
                                </span>
                            </div>
                        </motion.div>
                    )}

                    <div className="px-5 flex flex-col h-full">
                        {/* Card header - Status badges */}
                        <div className="pt-4 pb-1 flex flex-wrap items-center gap-2">
                            {mostRecent && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="inline-flex items-center gap-1 text-xs font-medium relative overflow-hidden rounded-md px-2 py-1"
                                >
                                    <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-20"></span>
                                    <span className="relative z-10 flex items-center gap-1">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                        {t('mostRecent')}
                                    </span>
                                </motion.div>
                            )}
                            {(isUpcoming || (isTodayWithoutVideo && !isUpcoming)) && (
                                <Badge variant="default" className="shrink-0 w-fit flex items-center gap-1.5 relative overflow-hidden">
                                    <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-50"></span>
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {isUpcoming ? (
                                            <>{t('upcoming')}: {formatDistanceToNow(meeting.dateTime, { locale: locale === 'el' ? el : enUS })}</>
                                        ) : (
                                            t('today')
                                        )}
                                    </span>
                                </Badge>
                            )}
                            {!meeting.released && (
                                <Badge variant="outline" className="shrink-0 w-fit flex items-center gap-1 bg-destructive/5 text-destructive border-destructive/20">
                                    {t('notPublic')}
                                </Badge>
                            )}
                        </div>

                        {/* Meeting title */}
                        <div className="pb-1">
                            <h3
                                className={cn(
                                    "text-xl sm:text-2xl text-foreground/90 line-clamp-2 tracking-tight transition-colors duration-200",
                                    isHovered ? "text-primary" : ""
                                )}
                            >
                                {meeting.name}
                            </h3>
                        </div>

                        {/* Meeting metadata - more compact */}
                        <div className="mt-1 mb-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                            {meeting.administrativeBody && (
                                <div className="flex items-center gap-1">
                                    <Building className="w-3.5 h-3.5 text-muted-foreground/70" />
                                    <span>{meeting.administrativeBody.name}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground/70" />
                                <span>{(isUpcoming || isToday)
                                    ? formatDateTime(meeting.dateTime, cityTimezone)
                                    : formatDate(meeting.dateTime, cityTimezone)}
                                </span>
                            </div>
                        </div>

                        {/* Subjects list - more compact */}
                        <div className="mt-2 pb-3 flex-1">
                            <div className="pt-2 border-t flex flex-col h-full">
                                {hasSubjects ? (
                                    <>
                                        <div className="flex flex-col">
                                            {sortedSubjects.slice(0, 3).map((subject) => (
                                                <div
                                                    key={subject.id}
                                                    className="flex items-center gap-3 py-1.5 rounded-md hover:bg-accent/10 cursor-pointer transition-colors"
                                                >
                                                    <div className="w-full">
                                                        <SubjectBadge subject={subject} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {remainingSubjectsCount > 0 && (
                                            <div
                                                className="flex items-center justify-between py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/10 cursor-pointer transition-colors"
                                            >
                                                <span>{t('moreSubjects', { count: remainingSubjectsCount })}</span>
                                                <ChevronRight className="w-3.5 h-3.5" />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="flex items-center gap-3 w-full">
                                            <div className="h-px bg-border flex-1"></div>
                                            <span className="text-xs text-muted-foreground px-2">Χωρίς θέματα</span>
                                            <div className="h-px bg-border flex-1"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
