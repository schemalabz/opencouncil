"use client"

import { useTranslations } from 'next-intl';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import { AdminOnly, AdminToolButton, adminToolClass } from '@/components/admin/AdminStrip';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate } from '@/lib/formatters/time';
import type { DiavgeiaUnitScope } from '@/lib/utils/diavgeiaUnitScope';
import type { getPollingHistoryForMeeting } from '@/lib/tasks/pollDecisions';
import type { MeetingAttendanceRecord } from '@/lib/db/decisions';
import type { PersonWithRelations } from '@/lib/db/people';
import { diavgeiaSearchUrl } from './pdfUrl';
import { MeetingAttendanceSummary } from './shared';

type PollingStatus = Awaited<ReturnType<typeof getPollingHistoryForMeeting>>;

interface AdminToolsProps {
    diavgeiaUid: string | null;
    scopes: DiavgeiaUnitScope[];
    scopeError: string | null;
    pollingStatus: PollingStatus | null;
    isPolling: boolean;
    skipCache: boolean;
    onSkipCacheChange: (value: boolean) => void;
    onPoll: () => void;
    canClear: boolean;
    isClearing: boolean;
    onClear: () => void;
    attendance: MeetingAttendanceRecord[];
    getPerson: (id: string) => PersonWithRelations | undefined;
    administrativeBodyId: string | null;
    mayorPersonId: string | null;
}

/**
 * The back-of-house controls of the decisions page, in the frame every
 * staff-only surface wears. A city admin never sees this; a superadmin finds
 * the poll, the cache switch, the Diavgeia scope, the roll call and the
 * extraction wipe together, below the record they act on.
 */
export function AdminTools({ diavgeiaUid, scopes, scopeError, pollingStatus, isPolling, skipCache, onSkipCacheChange, onPoll, canClear, isClearing, onClear, attendance, getPerson, administrativeBodyId, mayorPersonId }: AdminToolsProps) {
    const t = useTranslations('admin.decisionsPage');
    const tCommon = useTranslations('Common');

    const history: string[] = [];
    if (pollingStatus && pollingStatus.totalPolls > 0) {
        history.push(t('polling.polled', { n: pollingStatus.totalPolls }));
        if (pollingStatus.firstPollAt) history.push(t('polling.started', { date: formatDate(new Date(pollingStatus.firstPollAt)) }));
        if (pollingStatus.currentTier?.kind === 'everyRun') history.push(t('polling.tier.everyRun'));
        if (pollingStatus.currentTier?.kind === 'interval') history.push(t('polling.tier.interval', { days: pollingStatus.currentTier.intervalDays }));
        if (pollingStatus.nextPollEligible) history.push(t('polling.next', { date: formatDate(new Date(pollingStatus.nextPollEligible)) }));
        else if (pollingStatus.currentTier?.kind === 'stopped') history.push(t('polling.stopped'));
    }

    return (
        <AdminOnly label={tCommon('adminOnly')}>
            <div className="flex flex-wrap items-center gap-1.5">
                <AdminToolButton onClick={onPoll} disabled={isPolling || !diavgeiaUid}>
                    {isPolling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
                    {skipCache ? t('tools.pollSkipCache') : t('tools.poll')}
                </AdminToolButton>
                <label className={`${adminToolClass} inline-flex cursor-pointer items-center gap-1.5`}>
                    <Checkbox checked={skipCache} onCheckedChange={checked => onSkipCacheChange(checked === true)} className="h-3.5 w-3.5" />
                    {t('skipCacheLabel')}
                </label>
                {/* A missing organisation or a malformed unit shows in the page's status line, for every admin. */}
                {diavgeiaUid && !scopeError && (
                    <>
                        <AdminToolButton asChild>
                            <a href={diavgeiaSearchUrl(diavgeiaUid)} target="_blank" rel="noopener noreferrer">{t('scope.org', { org: diavgeiaUid })}</a>
                        </AdminToolButton>
                        {scopes.length === 0 && <span className="px-2.5 text-xs text-amber-700">{t('scope.orgWide')}</span>}
                        {scopes.map(scope => (
                            <AdminToolButton key={`${scope.unit}:${scope.signer ?? ''}`} asChild>
                                <a href={diavgeiaSearchUrl(diavgeiaUid, scope)} target="_blank" rel="noopener noreferrer">
                                    {scope.signer ? t('scope.unitSigner', { unit: scope.unit, signer: scope.signer }) : t('scope.unit', { unit: scope.unit })}
                                </a>
                            </AdminToolButton>
                        ))}
                    </>
                )}
                {canClear && (
                    <AdminToolButton destructive onClick={onClear} disabled={isClearing}>
                        {isClearing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                        {t('resetExtractions')}
                    </AdminToolButton>
                )}
                {history.length > 0 && (
                    <span className="ml-auto px-2.5 text-xs text-muted-foreground">{history.join(' · ')}</span>
                )}
            </div>
            {skipCache && <div className="px-2.5 pt-1.5 text-[11px] text-muted-foreground">{t('skipCacheHint')}</div>}
            {attendance.length > 0 && (
                <div className="mt-1.5">
                    <MeetingAttendanceSummary attendance={attendance} getPerson={getPerson} administrativeBodyId={administrativeBodyId} mayorPersonId={mayorPersonId} />
                </div>
            )}
        </AdminOnly>
    );
}
