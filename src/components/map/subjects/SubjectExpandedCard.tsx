'use client';

import { ArrowRight, CalendarDays, Clock, Landmark, MapPin, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Icon from '@/components/icon';
import { formatDate } from '@/lib/formatters/time';
import { captureLandingAction } from '@/lib/landing/analytics';
import { subjectLocationLine, type LandingSubject } from '@/lib/landing/landingData';
import { topicStyle } from '@/lib/topicStyle';

/* Expanded subject (mobile). The category bar (back · category), the title + municipality logo, the
   meta, and the "Προβολή θέματος" link are all pinned; only the description scrolls between the meta
   and the link. The map has already flown to the subject. */
export function SubjectExpandedCard({
    subject,
    onClose,
    openSource = 'map_preview',
}: {
    subject: LandingSubject;
    /** × / title / logo → return to previewing this subject */
    onClose: () => void;
    /** what the 'Δες τη συζήτηση' click reports as its source */
    openSource?: string;
}) {
    const t = useTranslations('landingV2');
    const locale = useLocale();
    const locationLine = subjectLocationLine(subject);
    const topicBar = topicStyle(subject.topic.color);
    return (
        <div
            className="absolute inset-x-3 bottom-[10px] z-[9] flex max-h-[68dvh] animate-in flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-xl duration-300 fade-in slide-in-from-bottom-4"
            style={{ borderColor: subject.topic.color }}
        >
            {/* full-width category bar: back · category */}
            <div
                className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 text-xs font-bold"
                style={{ backgroundColor: topicBar.background, color: topicBar.icon }}
            >
                <Icon name={subject.topic.icon || 'hash'} color={topicBar.icon} size={16} />
                <span className="min-w-0 flex-1 truncate">{subject.topic.name}</span>
                {/* one control, not two: the × collapses back to previewing this subject (what the
                    back arrow used to do). Dropping the subject entirely is a tap on the map. */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.back')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:bg-card hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* title + municipality logo (pinned) — tapping it returns to the preview, like the back arrow */}
            <button
                type="button"
                onClick={onClose}
                aria-label={t('common.back')}
                className="flex shrink-0 items-start gap-2 px-4 pt-2.5 pb-1 text-left"
            >
                {subject.cityLogo && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={subject.cityLogo} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </span>
                )}
                <h3 className="text-balance text-lg font-bold leading-tight text-foreground">{subject.title}</h3>
            </button>

            {/* scrollable region — meta + description; the title above stays pinned */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {/* meta — discussion time · date · location · admin body, like the desktop card */}
                <div className="mx-4 mt-2 flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5">
                    {subject.durationMin > 0 && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <Clock className="h-3 w-3 shrink-0" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                        </div>
                    )}
                    {subject.date && (
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(new Date(subject.date), subject.cityTimezone, locale)}
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

                {/* description */}
                {subject.summary && (
                    <p className="px-4 py-3 text-sm leading-relaxed text-foreground/80">{subject.summary}</p>
                )}
            </div>

            {/* Δες τη συζήτηση (pinned) — an ombré fade above it hints the content scrolls beneath */}
            <div className="relative shrink-0">
                <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-card to-transparent" />
                <Link
                    href={subject.href}
                    onClick={() =>
                        captureLandingAction('subject_opened', {
                            source: openSource,
                            subject_id: subject.id,
                            city_id: subject.cityId,
                        })
                    }
                    className="mx-4 mb-3 mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange))] no-underline hover:underline"
                >
                    {t('subject.view')} <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}
