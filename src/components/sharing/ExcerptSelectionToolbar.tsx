'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Share2, Loader2 } from 'lucide-react';
import type { AppLocale } from '@/i18n/config';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { digestExcerpt, excerptPath, type ExcerptSelector, type ExcerptSource } from '@/lib/sharing/excerptSelector';
import { captureExcerptSelection, type SelectionResult, type CapturedExcerpt } from '@/lib/sharing/selection';
import { Button } from '@/components/ui/button';
import { ContentShareDialog } from './ContentShareDialog';
import { ExcerptQuote, excerptQuoteText } from './ExcerptQuote';
import { TranscriptReviewNotice } from './TranscriptReviewNotice';

export const EXCERPT_SHARE_EVENT = 'oc:share-excerpt';
export function useExcerptSources() {
    const { transcript, getPerson, getSpeakerTag, speakerTags } = useCouncilMeetingData();
    const locale = useLocale();
    return useMemo<ExcerptSource[]>(() => transcript.flatMap(segment => {
        const tag = getSpeakerTag(segment.speakerTagId) ?? segment.speakerTag;
        const person = tag.personId ? getPerson(tag.personId) : null;
        return segment.utterances.map(utterance => ({
            id: utterance.id, text: localizeText(utterance.text, locale), startTimestamp: utterance.startTimestamp,
            speakerTagId: tag.id, personId: tag.personId,
            speakerName: person ? getLocalizedName(person, locale) : null,
        }));
    }), [transcript, getPerson, getSpeakerTag, speakerTags, locale]);
}

export function ExcerptSelectionToolbar({ rootRef, disabled, editable }: { rootRef: RefObject<HTMLDivElement | null>; disabled: boolean; editable: boolean }) {
    const { city, meeting, subjects, transcript, taskStatus } = useCouncilMeetingData();
    const locale = useLocale() as AppLocale;
    const t = useTranslations('sharing');
    const sources = useExcerptSources();
    const reviewNotice = taskStatus.humanReview ? null : t('unreviewedNotice');
    const [selection, setSelection] = useState<SelectionResult>({ status: 'empty' });
    const [active, setActive] = useState<CapturedExcerpt | null>(null);
    const [url, setUrl] = useState('');
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const openRef = useRef(false);
    openRef.current = open;
    const selectedSubject = useMemo(() => {
        if (!active) return null;
        const selectedIds = new Set(active.runs.map(run => run.id));
        const utterances = transcript.flatMap(segment => segment.utterances).filter(utterance => selectedIds.has(utterance.id));
        const ids = new Set(utterances.map(utterance => utterance.discussionSubjectId));
        return ids.size === 1 && !ids.has(null) ? subjects.find(subject => ids.has(subject.id)) : null;
    }, [active, transcript, subjects]);
    const context = `${getLocalizedName(city, locale)} · ${formatDate(meeting.dateTime, city.timezone, locale)}`;

    const openSelection = useCallback(async (captured: SelectionResult) => {
        if (captured.status !== 'ok') {
            setError(t(captured.status === 'too-long' ? 'selectionTooLong' : 'selectionInvalid'));
            return;
        }
        setPending(true); setError('');
        try {
            const { selection: value } = captured;
            const selector: ExcerptSelector = {
                cityId: city.id, meetingId: meeting.id, firstUtteranceId: value.firstUtteranceId, lastUtteranceId: value.lastUtteranceId,
                textLocale: locale, digest: await digestExcerpt(value.runs),
            };
            setActive(value); setUrl(new URL(excerptPath(selector), window.location.origin).href); setOpen(true);
        } catch { setError(t('selectionInvalid')); }
        finally { setPending(false); }
    }, [city.id, meeting.id, locale, t]);

    useEffect(() => {
        if (disabled) { setSelection({ status: 'empty' }); return; }
        let frame = 0;
        const readSelection = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                if (openRef.current || !rootRef.current) return;
                const selection = window.getSelection();
                const result = captureExcerptSelection(rootRef.current, selection?.rangeCount ? selection.getRangeAt(0) : null, sources);
                setSelection(result); setError('');
            });
        };
        const shareContext = (event: Event) => {
            if (!rootRef.current) return;
            const detail = (event as CustomEvent<{ range: Range | null; utteranceId: string }>).detail;
            const selected = captureExcerptSelection(rootRef.current, detail.range, sources);
            void openSelection(selected.status === 'empty' ? captureExcerptSelection(rootRef.current, null, sources, detail.utteranceId) : selected);
        };
        document.addEventListener('selectionchange', readSelection);
        window.addEventListener('scroll', readSelection, true);
        window.addEventListener('resize', readSelection);
        const root = rootRef.current;
        root?.addEventListener(EXCERPT_SHARE_EVENT, shareContext);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('selectionchange', readSelection);
            window.removeEventListener('scroll', readSelection, true);
            window.removeEventListener('resize', readSelection);
            root?.removeEventListener(EXCERPT_SHARE_EVENT, shareContext);
        };
    }, [disabled, rootRef, sources, openSelection]);

    const visible = selection.status === 'ok' && !open && !disabled;
    const rect = selection.status === 'ok' ? selection.selection.rect : null;
    return <>
        {visible && rect && <div className="fixed z-40 max-w-[calc(100vw-2rem)]" style={{ left: Math.max(16, Math.min(rect.left, window.innerWidth - 300)), top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 64)) }}>
            <Button className="min-h-11 gap-2 rounded-full bg-[hsl(var(--orange-deep))] text-white shadow-lg hover:bg-[color-mix(in_srgb,hsl(var(--orange-deep)),black_8%)] hover:opacity-100" onMouseDown={event => event.preventDefault()} onClick={() => openSelection(selection)} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}{t('shareExcerpt')}
            </Button>
        </div>}
        {(error || selection.status === 'too-long') && !open && <div role="status" className="fixed bottom-5 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 border bg-background p-4 text-sm shadow-lg">{error || t('selectionTooLong')}</div>}
        <ContentShareDialog open={open} onOpenChange={setOpen} title={t('shareExcerpt')} description={t('excerptDescription')} url={url}
            sourceText={active ? [reviewNotice, `${excerptQuoteText(active.runs, t('unknownSpeaker'))}\n${context}\n${getLocalizedName(meeting, locale)}`].filter(Boolean).join('\n\n') : ''} copyTextLabel={t('copyQuote')}>
            {active && <div className="space-y-5">
                <p className="text-xs font-medium leading-5 text-muted-foreground">{selectedSubject?.name ?? getLocalizedName(meeting, locale)}<br />{context}</p>
                {reviewNotice && <TranscriptReviewNotice text={reviewNotice} />}
                <div className="max-h-[35dvh] overflow-y-auto pr-1"><ExcerptQuote runs={active.runs} unknownSpeaker={t('unknownSpeaker')} compact /></div>
                <p className="text-xs leading-5 text-muted-foreground">{t('wholePassages')}{editable && <span className="mt-1 block">{t('savedTextOnly')}</span>}</p>
            </div>}
        </ContentShareDialog>
    </>;
}
