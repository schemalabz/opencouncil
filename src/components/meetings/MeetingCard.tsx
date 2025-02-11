'use client'
import { CouncilMeeting, Subject, Topic } from '@prisma/client';
import { useRouter, usePathname } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useLocale, useTranslations } from 'next-intl';
import React, { useEffect, useState } from 'react';
import { format, formatDistanceToNow, isFuture } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { StatisticsOfCouncilMeeting, Statistics } from '@/lib/statistics';
import { CalendarIcon, Clock, FileIcon, Loader2, VideoIcon, AudioLines, FileText, Ban, ChevronRight } from 'lucide-react';
import { sortSubjectsByImportance } from '@/lib/utils';
import SubjectBadge from '../subject-badge';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Badge } from '../ui/badge';
import { motion } from 'framer-motion';

interface MeetingCardProps {
    item: CouncilMeeting & { subjects: (Subject & { topic?: Topic | null })[] };
    editable: boolean;
    mostRecent?: boolean;
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

export default function MeetingCard({ item: meeting, editable, mostRecent }: MeetingCardProps) {
    const t = useTranslations('MeetingCard');
    const router = useRouter();
    const locale = useLocale();
    const pathname = usePathname();
    const [isLoading, setIsLoading] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        setIsLoading(false);
    }, [pathname]);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await router.push(`/${meeting.cityId}/${meeting.id}`);
    };

    const remainingSubjectsCount = meeting.subjects.length - 3;
    const isUpcoming = isFuture(meeting.dateTime);

    const getMediaIcon = () => {
        if (meeting.videoUrl) return <VideoIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />;
        if (meeting.audioUrl) return <AudioLines className="w-3.5 h-3.5 sm:w-4 sm:h-4" />;
        if (meeting.agendaUrl) return <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />;
        return <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />;
    };

    const getMediaStatus = () => {
        if (meeting.videoUrl) return t('withVideo');
        if (meeting.audioUrl) return t('withAudio');
        if (meeting.agendaUrl) return t('withAgenda');
        return t('noVideo');
    };

    return (
        <motion.div
            whileHover={{ scale: 1.01 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
        >
            <Card
                className={cn(
                    "relative h-full overflow-hidden transition-all duration-300",
                    "hover:shadow-lg cursor-pointer border-l-4",
                    mostRecent ? "border-l-primary" : "border-l-muted"
                )}
                onClick={handleClick}
            >
                <CardContent className="relative h-full flex flex-col p-4 sm:p-6">
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

                    <div className="space-y-3 sm:space-y-4 flex flex-col flex-grow">
                        <div className="space-y-2">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                                <motion.h3
                                    className="text-lg sm:text-xl font-bold text-foreground/90 line-clamp-2"
                                    animate={{ color: isHovered ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                                >
                                    {meeting.name}
                                </motion.h3>
                                {isUpcoming && (
                                    <Badge variant="outline" className="shrink-0 w-fit flex items-center gap-1 bg-primary/5 text-primary border-primary/20">
                                        <Clock className="w-3.5 h-3.5" />
                                        Σε {formatDistanceToNow(meeting.dateTime, { locale: locale === 'el' ? el : enUS })}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
                                <motion.div
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {format(meeting.dateTime, 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS })}
                                </motion.div>
                                <motion.div
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    {getMediaIcon()}
                                    {getMediaStatus()}
                                </motion.div>
                                <motion.div
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50"
                                    whileHover={{ scale: 1.05 }}
                                >
                                    <FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    {meeting.subjects.length} {t('subjects')}
                                </motion.div>
                            </div>
                        </div>

                        {meeting.subjects.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex flex-col gap-1.5">
                                    {meeting.subjects.slice(0, 3).map((subject) => (
                                        <motion.div
                                            key={subject.id}
                                            whileHover={{ x: 4 }}
                                            className="flex items-center gap-2"
                                        >
                                            <SubjectBadge subject={subject} />
                                        </motion.div>
                                    ))}
                                </div>
                                {remainingSubjectsCount > 0 && (
                                    <motion.div
                                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                                        whileHover={{ x: 4 }}
                                    >
                                        <span>+{remainingSubjectsCount} ακόμα θέματα</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                    {mostRecent && (
                        <div className="absolute -top-3 -right-3 z-10">
                            <Badge variant="outline" className="shrink-0 w-fit flex items-center gap-1 bg-primary/5 text-primary border-primary/20">
                                {t('mostRecent')}
                            </Badge>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
