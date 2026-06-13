"use client"

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Clock, Landmark, MapPin, MapPinOff, Users } from 'lucide-react';
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
    /** Identify the municipality on the card (multi-municipality views). */
    showCity?: boolean;
    cityLogo?: string | null;
}

/**
 * A subject row in the map panel: the topic icon leads, the municipality and
 * administrative body identify the source, and unlocated subjects say so
 * quietly where the location would be. Expands in place with the full
 * description and a CTA to the subject page.
 */
export function SubjectListItem({ subject, expanded, onToggle, onHover, showCity = false, cityLogo }: SubjectListItemProps) {
    const t = useTranslations('map');
    const minutes = Math.round(subject.discussionTimeSeconds / 60);

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
                <div className="flex gap-3">
                    {/* The topic, by icon alone */}
                    <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${subject.topicColor}1f` }}
                        title={subject.topicName ?? undefined}
                        aria-label={subject.topicName ?? undefined}
                    >
                        {subject.topicIcon && <Icon name={subject.topicIcon} color={subject.topicColor} size={17} />}
                    </span>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className={cn('text-sm font-medium leading-snug text-foreground', !expanded && 'line-clamp-2')}>
                                {subject.name}
                            </h3>
                            {subject.meetingDate && (
                                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                                    {formatDate(new Date(subject.meetingDate))}
                                </span>
                            )}
                        </div>

                        {subject.description && !expanded && (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                                {subject.description}
                            </p>
                        )}

                        {/* Who: municipality (when ambiguous) + administrative body */}
                        {((showCity && subject.cityName) || subject.adminBodyName) && (
                            <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs">
                                {showCity && subject.cityName && (
                                    <span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                                        {cityLogo ? (
                                            <Image src={cityLogo} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                                        ) : (
                                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        {subject.cityName}
                                    </span>
                                )}
                                {subject.adminBodyName && (
                                    <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                                        <Landmark className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{subject.adminBodyName}</span>
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Where + numbers */}
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            {subject.locationText ? (
                                <span className="flex min-w-0 items-center gap-1">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{subject.locationText}</span>
                                </span>
                            ) : (
                                <span className="flex min-w-0 items-center gap-1 text-red-400/80">
                                    <MapPinOff className="h-3 w-3 shrink-0" />
                                    <span>{t('noLocation')}</span>
                                </span>
                            )}
                            {subject.discussionTimeSeconds > 0 && (
                                <span className="flex shrink-0 items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {t('minutesShort', { minutes: Math.max(minutes, 1) })}
                                    <Users className="ml-1 h-3 w-3" />
                                    {subject.speakerCount}
                                </span>
                            )}
                        </div>
                    </div>
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
                        <div className="space-y-3 px-4 pb-4 pl-16">
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
