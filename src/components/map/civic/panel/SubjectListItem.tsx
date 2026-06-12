"use client"

import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Clock, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters/time';
import Icon from '@/components/icon';
import type { MapSubject } from '@/lib/map/types';

interface SubjectListItemProps {
    subject: MapSubject;
    expanded: boolean;
    onToggle: (subject: MapSubject | null) => void;
    onHover?: (subjectId: string | null) => void;
}

/** Light text-contrast check for the topic pill. */
function pillTextColor(hex: string): string {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return '#ffffff';
    const value = parseInt(match[1], 16);
    const luminance = (0.299 * ((value >> 16) & 0xff) + 0.587 * ((value >> 8) & 0xff) + 0.114 * (value & 0xff)) / 255;
    return luminance > 0.66 ? '#0c0a09' : '#ffffff';
}

/**
 * A subject row in the map panel: dense at rest, expanding in place with the
 * full description and a CTA to the subject page.
 */
export function SubjectListItem({ subject, expanded, onToggle, onHover }: SubjectListItemProps) {
    const t = useTranslations('map');
    const minutes = Math.round(subject.discussionTimeSeconds / 60);
    const textColor = pillTextColor(subject.topicColor);

    return (
        <div
            data-subject-id={subject.id}
            className={cn(
                'border-b border-border transition-colors',
                expanded ? 'bg-accent/10' : 'hover:bg-muted/60',
            )}
            onMouseEnter={() => onHover?.(subject.id)}
            onMouseLeave={() => onHover?.(null)}
        >
            <button
                type="button"
                onClick={() => onToggle(expanded ? null : subject)}
                aria-expanded={expanded}
                className="w-full px-4 py-3 text-left"
            >
                <div className="flex items-center justify-between gap-2">
                    {subject.topicName ? (
                        <span
                            className="flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold"
                            style={{ backgroundColor: subject.topicColor, color: textColor }}
                        >
                            {subject.topicIcon && <Icon name={subject.topicIcon} color={textColor} size={12} />}
                            {subject.topicName}
                        </span>
                    ) : <span />}
                    {subject.meetingDate && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDate(new Date(subject.meetingDate))}
                        </span>
                    )}
                </div>
                <h3 className={cn('mt-1.5 text-sm font-medium leading-snug text-foreground', !expanded && 'line-clamp-2')}>
                    {subject.name}
                </h3>
                {subject.description && !expanded && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                        {subject.description}
                    </p>
                )}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1">
                        {subject.cityName && (
                            <>
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="shrink-0">{subject.cityName}</span>
                            </>
                        )}
                        {subject.locationText && (
                            <>
                                <MapPin className="ml-1 h-3 w-3 shrink-0" />
                                <span className="truncate">{subject.locationText}</span>
                            </>
                        )}
                    </span>
                    {subject.discussionTimeSeconds > 0 && (
                        <span className="flex shrink-0 items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t('minutesShort', { minutes: Math.max(minutes, 1) })}
                            <Users className="ml-1 h-3 w-3" />
                            {subject.speakerCount}
                        </span>
                    )}
                </div>
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-3 px-4 pb-4">
                            {subject.description && (
                                <p className="line-clamp-6 text-[13px] leading-relaxed text-muted-foreground">
                                    {subject.description}
                                </p>
                            )}
                            {subject.meetingName && (
                                <p className="text-xs text-muted-foreground">
                                    {subject.meetingName}
                                    {subject.meetingDate ? ` · ${formatDate(new Date(subject.meetingDate))}` : ''}
                                </p>
                            )}
                            <Link
                                href={`/${subject.cityId}/${subject.councilMeetingId}/subjects/${subject.id}`}
                                className="flex h-10 w-full items-center justify-center bg-[hsl(24,100%,50%)] text-sm font-medium text-white transition-[filter] hover:brightness-105"
                            >
                                {t('viewSubject')}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
