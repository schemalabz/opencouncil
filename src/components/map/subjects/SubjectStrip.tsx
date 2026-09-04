'use client';

import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CalendarDays, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { formatDate } from '@/lib/formatters/time';
import { subjectLocationLine, type LandingSubject } from '@/lib/landing/landingData';
import { topicStyle } from '@/lib/topicStyle';

/* Bottom horizontal-scroll strip of compact subject cards. Two modes: the first tap on a card
   previews it (highlighted in its category colour, brought to the front); tapping the previewed
   card selects it (the expanded box takes over). A subject tapped on the map also previews here. */
export function SubjectStrip({
    subjects,
    previewId,
    onPreview,
    onSelect,
    trailing,
    maxCards,
}: {
    subjects: LandingSubject[];
    previewId: string | null;
    onPreview: (id: string | null) => void;
    onSelect: (id: string) => void;
    /** A last card after the subjects — what the search found and where the rest of it is. */
    trailing?: ReactNode;
    /** Render at most this many cards. Omitted — the landing — renders every subject. */
    maxCards?: number;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Both callers rebuild these handlers on every render (a map moveend is enough), which would
    // leave StripCard's memo nothing to compare. A card only ever calls the current pair, so it
    // goes through a ref and keeps the two props it is given stable.
    const handlers = useRef({ onPreview, onSelect });
    handlers.current = { onPreview, onSelect };
    const preview = useCallback((id: string) => handlers.current.onPreview(id), []);
    const select = useCallback((id: string) => handlers.current.onSelect(id), []);

    // A viewport-wide list runs to a few hundred subjects, and a strip of them is both a large
    // first payload and a large reconciliation on every pan. `maxCards` keeps the best-ranked
    // head of the list; the map itself is the control that brings the rest into view.
    const shown = useMemo(() => {
        if (maxCards == null || subjects.length <= maxCards) return subjects;
        const capped = subjects.slice(0, maxCards);
        // A previewed subject joins the list at its end rather than being reordered into it, so
        // the cap would drop the one card the strip has to scroll to.
        if (previewId && !capped.some((s) => s.id === previewId)) {
            const previewed = subjects.find((s) => s.id === previewId);
            if (previewed) capped.push(previewed);
        }
        return capped;
    }, [subjects, maxCards, previewId]);

    // The previewed subject keeps its position in the list — the strip just scrolls it into view
    // (centred), without reordering. When the preview clears (e.g. zooming out drops it), the strip
    // resets to the start so the list reads from the top again.
    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        if (!previewId) {
            root.scrollTo({ left: 0, behavior: 'instant' });
            return;
        }
        const el = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(previewId)}"]`);
        if (!el) return;
        const target = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2;
        root.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [previewId]);

    // An empty strip used to render nothing at all. Under a search that is the
    // one case the reader most needs a card for: the matches are real, they are
    // simply not in view, and the trailing card is what says so.
    if (!shown.length && !trailing) return null;
    return (
        <div
            ref={scrollRef}
            className="flex items-end gap-3 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
        >
            {shown.map((s) => (
                <StripCard key={s.id} subject={s} active={s.id === previewId} onPreview={preview} onSelect={select} />
            ))}
            {trailing}
        </div>
    );
}

/* One card in the strip: a full-width category bar, then the municipality logo + title, then
   discussion time · date · address. The previewed card (`active`) gets an outline in its category
   colour. Fixed height, so every card matches: the title clamps to two lines ("…") and the meta
   sits at the bottom.

   Memoized: the list the strip is given gets a fresh identity on every map move, and its cards
   carry an inline SVG each — reconciling all of them per pan is the strip's whole cost. */
const StripCard = memo(function StripCard({
    subject,
    active,
    onPreview,
    onSelect,
}: {
    subject: LandingSubject;
    active: boolean;
    onPreview: (id: string) => void;
    onSelect: (id: string) => void;
}) {
    const t = useTranslations('landingV2');
    const locale = useLocale();
    const locationLine = subjectLocationLine(subject);
    const topicBar = topicStyle(subject.topic.color);
    return (
        <button
            type="button"
            data-id={subject.id}
            // first tap previews; tapping the already-previewed card selects it
            onClick={() => (active ? onSelect(subject.id) : onPreview(subject.id))}
            className={cn(
                'flex h-[150px] w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-md transition-colors',
                !active && 'border-black/20',
                active && 'border-2'
            )}
            style={active ? { borderColor: subject.topic.color } : undefined}
        >
            {/* full-width category bar */}
            <div
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold"
                style={{ backgroundColor: topicBar.background, color: topicBar.icon }}
            >
                <Icon name={subject.topic.icon || 'hash'} color={topicBar.icon} size={12} />
                <span className="min-w-0 truncate">{subject.topic.name}</span>
                {/* previewed card: a right chevron hints "tap again to open", on the same disc the
                    expanded card's × sits on so the two read as one control in two states */}
                {active && (
                    <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur">
                        <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
                {/* municipality logo + title (clamped — the card keeps a fixed height) */}
                <div className="flex items-start gap-2">
                    {subject.cityLogo && (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={subject.cityLogo} alt="" loading="lazy" className="h-full w-full object-contain" />
                        </span>
                    )}
                    <span className="line-clamp-2 min-w-0 text-sm font-bold leading-snug text-foreground">{subject.title}</span>
                </div>
                {/* pinned to the bottom so the meta lines up across cards */}
                <span className="mt-auto flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                    {subject.durationMin > 0 && (
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" /> {t('subject.discussionMinutes', { min: subject.durationMin })}
                        </span>
                    )}
                    {subject.date && (
                        <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(new Date(subject.date), subject.cityTimezone, locale)}
                        </span>
                    )}
                    {locationLine && (
                        <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{locationLine}</span>
                        </span>
                    )}
                </span>
            </div>
        </button>
    );
});
