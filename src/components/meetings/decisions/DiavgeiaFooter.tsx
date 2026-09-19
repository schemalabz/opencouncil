"use client";

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { DiavgeiaSourceLink } from '@/components/meetings/decisions/DiavgeiaSource';
import type { PollCadence } from '@/lib/tasks/pollDecisionsBackoff';
import type { ReadDiavgeiaUnitEntry } from '@/lib/utils/diavgeiaUnitScope';

/** The footer reads the state the backoff schedule produces, so the page and
 * the task service cannot disagree about whether a poll is on its way. */
export type DiavgeiaFooterState = PollCadence;

export interface DiavgeiaFooterProps {
    diavgeiaUid: string | null;
    pollScope: ReadDiavgeiaUnitEntry[];
    /** The last poll's date, already formatted, or null when none has run. */
    lastCheck: string | null;
    pollState: DiavgeiaFooterState;
    onPoll: () => void;
    /** A manual check this page asked for is on its way to the task service.
     * Every run costs an extraction, so the button must not take a second click. */
    polling: boolean;
}

/**
 * Everything about Diavgeia, on one strip at the bottom of the questions card:
 * when we last looked, where we look, and a button to look again now.
 *
 * It is the page's only Diavgeia surface. The header used to carry the same
 * sentence while the footer carried the cadence and a button, so a reader met
 * the same fact twice on one screen. The cadence sentence is gone with it: a
 * last-check date plus a button that always works answers "is this current?"
 * without promising a date nobody watches.
 *
 * `blocked` — no organisation id, or a unit entry that does not parse — drops
 * the button, because no check can run. It needs no sentence of its own:
 * {@link DiavgeiaSourceLink} already marks the broken part of the line in
 * amber, and it names which part, which one blanket sentence could not.
 */
export function DiavgeiaFooter({
    diavgeiaUid,
    pollScope,
    lastCheck,
    pollState,
    onPoll,
    polling,
}: DiavgeiaFooterProps) {
    const t = useTranslations('admin.decisionsPage');

    return (
        // A quieter ground than the rows above, the same one the picker panels
        // open on: it sets the strip apart from them without a heading.
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
            {/* Full width on a phone, so the button wraps under the sentence
                instead of squeezing it into a column of single words. */}
            <p className="w-full min-w-0 sm:w-auto sm:flex-1">
                {lastCheck ? t('status.lastCheck', { date: lastCheck }) : t('status.lastCheckNever')}
                <DiavgeiaSourceLink diavgeiaUid={diavgeiaUid} pollScope={pollScope} dated={lastCheck !== null} />
            </p>
            {pollState.kind === 'running' ? (
                // Its own line: the sentence is two clauses long, and beside
                // the last-check line it would read as part of it.
                <span className="flex w-full items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    {t('poll.running')}
                </span>
            ) : pollState.kind === 'blocked' ? null : (
                <Button variant="outline" size="sm" className="shrink-0" disabled={polling} onClick={onPoll}>
                    {polling
                        ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('poll.action')}</>
                        : t('poll.action')}
                </Button>
            )}
        </div>
    );
}
