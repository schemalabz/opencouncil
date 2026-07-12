'use client';

import { MapPin, Landmark, Clock, CalendarDays, ArrowRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { formatDate } from '@/lib/formatters/time';
import { subjectLocationLine, type LandingSubject } from '@/lib/landing/landingData';
import { captureLandingAction } from '@/lib/landing/analytics';

/* "view the subject's page" affordance. A Link by default; renders a button when `onView` is
   given — for contexts without router context (e.g. a Mapbox popup). `source` = list vs preview. */
export function SubjectPageLink({
    href,
    onView,
    source,
    subjectId,
    cityId,
    className,
}: {
    href?: string;
    onView?: () => void;
    source?: 'list' | 'map_preview';
    subjectId?: string;
    cityId?: string;
    className?: string;
}) {
    const t = useTranslations('landingV2');
    const track = () =>
        captureLandingAction('subject_opened', { source: source ?? null, subject_id: subjectId, city_id: cityId });
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
    className,
}: {
    subject: LandingSubject;
    variant?: 'expanded' | 'preview';
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
                'relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card text-left shadow-sm transition-colors',
                clickable && 'cursor-pointer',
                selected ? 'border-[hsl(var(--orange))] border-4 shadow-lg' : 'border-black/60',
                className,
            )}
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

            {/* header — category bar */}
            <div
                className={cn(
                    'flex items-center gap-2 border-b border-border font-bold text-xs',
                    preview ? 'px-3 py-2' : 'px-4 py-2.5',
                )}
                style={{ backgroundColor: `${subject.topic.color}12` }}
            >
                <Icon name={subject.topic.icon || 'hash'} color={subject.topic.color} size={16} />
                <span style={{ color: subject.topic.color }}>{subject.topic.name}</span>
            </div>

            <div className={cn('flex min-w-0 flex-col gap-2', preview ? 'px-3 py-2' : 'px-3 pt-2 pb-3')}>
                <div className="flex items-start gap-2 content-center">
                    {subject.cityLogo && (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={subject.cityLogo}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-contain"
                            />
                        </span>
                    )}
                    <h3
                        className={cn(
                            'min-w-0 text-lg font-bold leading-tight text-foreground',
                            preview ? 'pr-7' : 'text-balance',
                        )}
                    >
                        {subject.title}
                    </h3>
                </div>

                {/* duration · date · location · admin body */}
                <div className={cn('flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5')}>
                    {subject.durationMin > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                                <Clock className="h-3 w-3" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                            </span>
                        </div>
                    )}
                    {subject.date && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(new Date(subject.date))}
                        </div>
                    )}

                    {locationLine && (
                        <div className="flex items-start gap-1 text-xs font-medium text-foreground/80">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">{locationLine}</span>
                        </div>
                    )}

                    {subject.bodyName && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <Landmark className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0">{subject.bodyName}</span>
                        </div>
                    )}
                </div>


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

                <SubjectPageLink
                    href={subject.href}
                    onView={onView}
                    source={preview ? 'map_preview' : 'list'}
                    subjectId={subject.id}
                    cityId={subject.cityId}
                    className={preview ? 'mt-0.5' : 'mt-1 underline'}
                />

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
