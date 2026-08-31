'use client'
import { useRouter, usePathname } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useState, useMemo, useReducer } from 'react';
import { isFuture } from 'date-fns';
import { getLocalizedName } from '@/lib/formatters/name';
import { CalendarIcon, Clock, Loader2, ChevronRight, Building } from 'lucide-react';
import { sortSubjectsByImportance, IS_DEV } from '@/lib/utils';
import { formatDateTime, localCalendarDate } from '@/lib/formatters/time';
import { RelativeTime } from '@/components/RelativeTime';
import SubjectBadge from '../subject-badge';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Badge } from '../ui/badge';
import { motion } from 'framer-motion';
import { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';

// Helper function for development-only logs
const logDev = (message: string, data?: any) => {
    if (IS_DEV) {
        console.log(`[Dev] ${message}`, data || '');
    }
};

interface MeetingCardProps {
    item: CouncilMeetingWithAdminBodyAndSubjects;
    editable: boolean;
    cityTimezone: string;
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

export default function MeetingCard({ item: meeting, editable, cityTimezone }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const pathname = usePathname();
    const [isLoading, setIsLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        setIsLoading(false);
    }, [pathname]);

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
                    contributionCount: s._count?.contributions || 0,
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
    // Compare calendar days in the city's timezone: the machine's local day is
    // UTC on the server and the visitor's zone in the browser, so the two ends
    // disagreed on which meetings are "today" (and both could be wrong for the
    // city).
    const isToday = localCalendarDate(new Date(meeting.dateTime), cityTimezone)
        === localCalendarDate(new Date(), cityTimezone);

    // Re-render just after the start so the badge flips from the ticking
    // countdown to the "today" label instead of counting upward into the past.
    const [, rerenderAtStart] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        if (!isUpcoming) return;
        // setTimeout overflows (and fires immediately) past 2^31-1 ms, so for
        // a meeting further out than that, chain timers until the start is
        // within one timeout's range.
        const startMs = new Date(meeting.dateTime).getTime() + 1000;
        const MAX_DELAY = 2 ** 31 - 1;
        let id: ReturnType<typeof setTimeout>;
        const schedule = () => {
            const remaining = Math.max(startMs - Date.now(), 0);
            id = setTimeout(
                remaining > MAX_DELAY ? schedule : rerenderAtStart,
                Math.min(remaining, MAX_DELAY),
            );
        };
        schedule();
        return () => clearTimeout(id);
    }, [isUpcoming, meeting.dateTime]);
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
                    "border-0"
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
                            {(isUpcoming || (isTodayWithoutVideo && !isUpcoming)) && (
                                <Badge variant="default" className="shrink-0 w-fit flex items-center gap-1.5 relative overflow-hidden">
                                    <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-50"></span>
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {isUpcoming ? (
                                            // One span, so the flex gap of the parent does not
                                            // replace the space between label and countdown.
                                            <span>{t('upcoming')}: <RelativeTime date={meeting.dateTime} addSuffix={false} /></span>
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
                            <h2
                                className={cn(
                                    "text-xl sm:text-2xl text-foreground/90 line-clamp-2 tracking-tight transition-colors duration-200",
                                    isHovered ? "text-primary" : ""
                                )}
                            >
                                {getLocalizedName(meeting, locale)}
                            </h2>
                        </div>

                        {/* Meeting metadata - more compact */}
                        <div className="mt-1 mb-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                            {meeting.administrativeBody && (
                                <div className="flex items-center gap-1">
                                    <Building className="w-3.5 h-3.5 text-muted-foreground/70" />
                                    <span>{getLocalizedName(meeting.administrativeBody, locale)}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground/70" />
                                <span>{formatDateTime(meeting.dateTime, cityTimezone, 'long', locale)}</span>
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
                                            <span className="text-xs text-muted-foreground px-2">{t('noSubjects')}</span>
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
