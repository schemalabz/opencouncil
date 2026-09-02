'use client';

import { MapPin, Landmark, Clock, CalendarDays, ArrowRight, X, Image as ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { SubjectImage } from '@/components/subject/SubjectImage';
import { formatDate } from '@/lib/formatters/time';
import { subjectLocationLine, type LandingSubject } from '@/lib/landing/landingData';
import { captureMapAction, type MapSurface } from '@/lib/analytics/capture';
import { topicStyle } from '@/lib/topicStyle';

/* "view the subject's page" affordance. A Link by default; renders a button when `onView` is
   given — for contexts without router context (e.g. a Mapbox popup). `source` = list vs preview. */
export function SubjectPageLink({
    href,
    onView,
    source,
    subjectId,
    cityId,
    surface = 'landing',
    className,
}: {
    href?: string;
    onView?: () => void;
    source?: 'list' | 'map_preview';
    /** Which page the card renders on — off-landing the event leaves the landing_* family. */
    surface?: MapSurface;
    subjectId?: string;
    cityId?: string;
    className?: string;
}) {
    const t = useTranslations('landingV2');
    const track = () =>
        captureMapAction(surface, 'subject_opened', { source: source ?? null, subject_id: subjectId, city_id: cityId });
    const cls = cn(
        'inline-flex w-fit items-center gap-1 self-start text-[13px] font-semibold text-[hsl(var(--orange))] underline',
        className,
    );
    const label = (
        <>
            {t('subject.view')} <ArrowRight className="h-3.5 w-3.5" />
        </>
    );
    if (onView) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    track();
                    onView();
                }}
                className={cls}
            >
                {label}
            </button>
        );
    }
    return (
        <Link
            href={href!}
            // Never prefetch: a subject page's RSC payload is multi-MB (full meeting transcript),
            // and the list would prefetch one per card scrolled into view.
            prefetch={false}
            onClick={(e) => {
                e.stopPropagation();
                track();
            }}
            className={cls}
        >
            {label}
        </Link>
    );
}

/* Unified subject card — used by the lists and the map preview.
   `variant='expanded'` (default) adds the description; `variant='preview'` is compact and
   takes an `onClose` (the × in the corner). */
export function SubjectCard({
    subject,
    variant = 'expanded',
    onClick,
    onClose,
    onView,
    selected,
    surface = 'landing',
    className,
}: {
    subject: LandingSubject;
    variant?: 'expanded' | 'preview';
    /** Which page the card renders on — passed through to the view link's analytics. */
    surface?: MapSurface;
    onClick?: () => void;
    /** preview only — renders the × close control */
    onClose?: () => void;
    /** when set, the "Προβολή θέματος" affordance is a button calling onView (no router needed) */
    onView?: () => void;
    selected?: boolean;
    /** extra classes merged into the card root (e.g. a stronger shadow for the map popup) */
    className?: string;
}) {
    const t = useTranslations('landingV2');
    const topicBar = topicStyle(subject.topic.color);
    const preview = variant === 'preview';
    const clickable = !!onClick;
    const locationLine = subjectLocationLine(subject);
    // Cap + fade a long description (expanded card only; a selected subject shows it in full).
    const clampDesc = !preview && !selected && !!subject.summary && subject.summary.length > 180;
    return (
        <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={onClick}
            onKeyDown={
                clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClick?.();
                        }
                    }
                    : undefined
            }
            className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors',
                clickable && 'cursor-pointer',
                selected ? 'border-2 shadow-lg' : 'border-black/60',
                className,
            )}
            style={selected ? { borderColor: subject.topic.color } : undefined}
        >
            {onClose && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    aria-label={t('common.close')}
                    className="absolute right-2 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            )}

            {/* hero — the illustration carries the topic, the place and the title; the card
                below it holds the facts. The image box is reserved at 7:4 before the bytes
                arrive, so the list does not jump as images load. */}
            <div className="relative aspect-[7/4] w-full overflow-hidden bg-muted">
                <SubjectImage subjectId={subject.id} alt="" />
                <span
                    className="absolute left-3 top-3 inline-flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm"
                    style={{ backgroundColor: topicBar.background, color: topicBar.icon }}
                >
                    <Icon name={subject.topic.icon || 'hash'} color={topicBar.icon} size={14} />
                    <span className="truncate">{subject.topic.name}</span>
                </span>
                {subject.cityLogo && !onClose && (
                    <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={subject.cityLogo} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-12 text-white">
                    {locationLine && (
                        <div className="mb-1 flex items-center gap-1 text-xs font-medium text-white/90">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 truncate">{locationLine}</span>
                        </div>
                    )}
                    <h3
                        className={cn(
                            'min-w-0 text-lg font-bold leading-tight text-white',
                            preview ? 'line-clamp-2' : 'text-balance',
                        )}
                    >
                        {subject.title}
                    </h3>
                </div>
            </div>

            <div className={cn('flex min-w-0 flex-col gap-2', preview ? 'px-3 py-2' : 'px-4 pb-3 pt-3')}>
                {subject.bodyName && (
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Landmark className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{subject.bodyName}</span>
                    </div>
                )}

                {/* duration · date */}
                {(subject.durationMin > 0 || subject.date) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                        {subject.durationMin > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                            </span>
                        )}
                        {subject.date && (
                            <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5 shrink-0" /> {formatDate(new Date(subject.date), subject.cityTimezone)}
                            </span>
                        )}
                    </div>
                )}


                {/* description — expanded only */}
                {!preview && subject.summary && (
                    <p
                        className={cn('text-sm text-foreground/80', clampDesc && 'max-h-[6.5rem] overflow-hidden')}
                        style={
                            clampDesc
                                ? {
                                    maskImage: 'linear-gradient(to bottom, #000 65%, transparent)',
                                    WebkitMaskImage: 'linear-gradient(to bottom, #000 65%, transparent)',
                                }
                                : undefined
                        }
                    >
                        {subject.summary}
                    </p>
                )}

                <div className={cn('flex items-center justify-between gap-2', preview ? 'mt-0.5' : 'mt-1')}>
                    <SubjectPageLink
                        surface={surface}
                        href={subject.href}
                        onView={onView}
                        source={preview ? 'map_preview' : 'list'}
                        subjectId={subject.id}
                        cityId={subject.cityId}
                        className={preview ? undefined : 'underline'}
                    />
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <ImageIcon className="h-3 w-3" aria-hidden />
                        {t('subject.aiImage')}
                    </span>
                </div>

                {/* dev-only ranking breakdown (attached by useFilteredSubjects in development) */}
                {process.env.NODE_ENV === 'development' && subject._debugRanking && (
                    <div className="mt-1 rounded-md border border-dashed border-border bg-muted/40 p-2 font-mono text-[10px] leading-tight text-muted-foreground">
                        <div className="mb-0.5 font-semibold text-foreground/80">
                            rank score: {subject._debugRanking.score.toFixed(3)}
                        </div>
                        {subject._debugRanking.components.map((c) => (
                            <div key={c.key} className="flex justify-between gap-2">
                                <span>{c.key}</span>
                                <span className="tabular-nums">
                                    {c.weight} × {c.signal.toFixed(2)} = {c.contribution.toFixed(3)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
