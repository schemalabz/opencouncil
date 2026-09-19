"use client";

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ANSWER_ROW, ANSWER_ROW_TEXT } from '@/components/meetings/decisions/controls';
import type { ManualOnlyReason, PollCadence } from '@/lib/tasks/pollDecisionsBackoff';

/** The footer renders exactly what the backoff schedule produces, so the
 * cadence has one definition and the two cannot drift apart. */
export type PollFooterState = PollCadence;

export interface PollFooterProps {
    pollState: PollFooterState;
    onPoll: () => void;
    /** A manual check this page asked for is on its way to the task service.
     * Every run costs an extraction, so the button must not take a second click. */
    polling: boolean;
}

/**
 * Why no automatic check is coming.
 *
 * Spelled out rather than composed as `poll.manualOnly.${reason}`: each reason
 * is then a key the catalog check can see, so a new one cannot ship without
 * its copy.
 *
 * @translationNamespace admin.decisionsPage
 */
function manualOnlySentence(t: (key: string) => string, reason: ManualOnlyReason): string {
    switch (reason) {
        case 'allDecided': return t('poll.manualOnlyAllDecided');
        case 'excludedMeeting': return t('poll.manualOnlyExcluded');
        case 'notYet': return t('poll.manualOnlyNotYet');
    }
}

/**
 * The questions card's last row: an idle city gets the cadence and a button
 * to ask for a check now; a running one gets a spinner and no button, so a
 * second click can't queue a second poll. A meeting the cron never selects
 * gets the reason and the same button, which always works. `blocked` renders
 * nothing — a city with no Diavgeia scope gets its own amber sentence from the
 * card instead, which this component does not know about.
 */
export function PollFooter({ pollState, onPoll, polling }: PollFooterProps) {
    const t = useTranslations('admin.decisionsPage');

    if (pollState.kind === 'blocked') return null;

    return (
        <div className={cn(ANSWER_ROW, 'items-center border-t border-border/60 px-5 py-3 text-[13px] text-muted-foreground')}>
            {pollState.kind === 'running' ? (
                // One flex item, not two: `justify-between` would drive the
                // spinner and its sentence to opposite edges of the row.
                <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    {t('poll.running')}
                </span>
            ) : (
                <>
                    <span className={ANSWER_ROW_TEXT}>
                        {/* A meeting in its first week is polled on every cron run, so
                            there is a cadence but no date to name. `everyDays` null is
                            the only "we stopped" state; a cadence with no date says the
                            cadence and stops there. `manualOnly` is a meeting the cron
                            never selects: it promises the button below and nothing else. */}
                        {pollState.kind === 'manualOnly'
                            ? manualOnlySentence(t, pollState.reason)
                            : pollState.everyDays === null
                                ? t('poll.stopped')
                                : pollState.nextCheck === null
                                    ? t('poll.cadenceFrequent', { days: pollState.everyDays })
                                    : t('poll.cadence', { days: pollState.everyDays, date: pollState.nextCheck })}
                        {' '}
                        {t('poll.prompt')}
                    </span>
                    {/* Hard right, opposite the question the sentence ends on:
                        the card's other rows put their action there too. */}
                    <Button variant="outline" size="sm" className="shrink-0" disabled={polling} onClick={onPoll}>
                        {polling
                            ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('poll.action')}</>
                            : t('poll.action')}
                    </Button>
                </>
            )}
        </div>
    );
}
