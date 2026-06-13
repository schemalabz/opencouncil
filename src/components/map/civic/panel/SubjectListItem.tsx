"use client"

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Clock, Landmark, MapPin, MapPinOff, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters/time';
import Icon from '@/components/icon';
import type { MapSubject } from '@/lib/map/types';
import type { SubjectRanking } from '@/lib/map/ranking';

const IS_DEV = process.env.NODE_ENV === 'development';

interface SubjectListItemProps {
    subject: MapSubject;
    expanded: boolean;
    onToggle: (subject: MapSubject | null) => void;
    onHover?: (subjectId: string | null) => void;
    /** Identify the municipality on the card (multi-municipality views). */
    showCity?: boolean;
    cityLogo?: string | null;
    /** Ranking breakdown — rendered as a dev-only clickable score chip. */
    ranking?: SubjectRanking;
}

/** Dev-only score chip that reveals the ranking breakdown when clicked. */
function RankingDebug({ ranking }: { ranking: SubjectRanking }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-1.5 text-[11px]">
            <button
                type="button"
                onClick={event => {
                    event.stopPropagation();
                    setOpen(value => !value);
                }}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground hover:text-foreground"
            >
                score {ranking.score.toFixed(2)}
                <span className="opacity-60">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <table className="mt-1 w-full font-mono text-[10px] text-muted-foreground">
                    <tbody>
                        {ranking.components.map(component => (
                            <tr key={component.key}>
                                <td className="pr-2">{component.key}</td>
                                <td className="pr-2 text-right tabular-nums">{component.signal.toFixed(2)}</td>
                                <td className="pr-2 text-right tabular-nums opacity-60">×{component.weight}</td>
                                <td className={cn('text-right tabular-nums', component.contribution >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                    {component.contribution >= 0 ? '+' : ''}{component.contribution.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/**
 * A subject row in the map panel: the topic icon leads, the municipality and
 * administrative body identify the source, and unlocated subjects say so
 * quietly where the location would be. Expands in place with the full
 * description and a CTA to the subject page.
 */
export function SubjectListItem({ subject, expanded, onToggle, onHover, showCity = false, cityLogo, ranking }: SubjectListItemProps) {
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
                        {/* Pre-title: who (municipality when ambiguous · body) + date */}
                        {((showCity && subject.cityName) || subject.adminBodyName || subject.meetingDate) && (
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    {showCity && subject.cityName && (
                                        <span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground">
                                            {cityLogo ? (
                                                <Image src={cityLogo} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
                                            ) : (
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            {subject.cityName}
                                        </span>
                                    )}
                                    {showCity && subject.cityName && subject.adminBodyName && (
                                        <span className="shrink-0 text-muted-foreground/60">·</span>
                                    )}
                                    {subject.adminBodyName && (
                                        <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                                            {!showCity && <Landmark className="h-3 w-3 shrink-0" />}
                                            <span className="truncate">{subject.adminBodyName}</span>
                                        </span>
                                    )}
                                </div>
                                {subject.meetingDate && (
                                    <span className="shrink-0 text-muted-foreground">
                                        {formatDate(new Date(subject.meetingDate))}
                                    </span>
                                )}
                            </div>
                        )}

                        <h3 className={cn('mt-1 text-sm font-medium leading-snug text-foreground', !expanded && 'line-clamp-2')}>
                            {subject.name}
                        </h3>

                        {subject.description && !expanded && (
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                                {subject.description}
                            </p>
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

                        {IS_DEV && ranking && <RankingDebug ranking={ranking} />}
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
