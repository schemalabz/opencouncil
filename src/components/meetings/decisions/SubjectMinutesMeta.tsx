"use client";

import { Clock, Mic, Users, Vote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MinutesSubject } from '@/lib/minutes/types';
import { getAgendaLabel } from '@/lib/utils/subjects';
import { voteResultSentence } from '@/components/meetings/decisions/timeline';

/**
 * The minutes facts of one row: position, what the transcript holds,
 * attendance, vote. Amber marks what the minutes would print as missing; a
 * vote-only or other-utterances subject is not a gap.
 */
export function SubjectMinutesMeta({ subject, position }: {
    subject: MinutesSubject;
    /** 1-based position in discussion order; null for a withdrawn subject */
    position: number | null;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    if (subject.withdrawn) return null;

    const gap = 'text-amber-700';
    const discussedWithLabel = subject.discussedWith
        ? getAgendaLabel(tSubject, subject.discussedWith)
        : null;

    const positionText = discussedWithLabel
        ? tPage('metaDiscussedWith', { label: discussedWithLabel })
        : subject.discussion.start === null
            ? tPage('metaPositionInferred')
            : position !== null ? tPage('metaPosition', { n: position }) : null;

    const kindText = subject.discussion.kind === 'discussed'
        ? tPage('metaDiscussed', { minutes: Math.max(1, Math.round(subject.discussion.seconds / 60)) })
        : subject.discussion.kind === 'voteOnly'
            ? tPage('metaVoteOnly')
            : subject.discussion.kind === 'other'
                ? tPage('metaOtherUtterances')
                : tPage('metaNoUtterances');

    const attendanceLabel = subject.attendance
        ? `${subject.attendance.present.length}/${subject.attendance.absent.length}`
        : null;
    const voteLabel = subject.voteResult
        ? voteResultSentence((key, params) => tPage(key, params as Record<string, string | number | Date> | undefined), subject.voteResult)
        : null;

    return (
        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
            {positionText && (
                <span className={`inline-flex items-center gap-1 ${subject.discussion.start === null && !discussedWithLabel ? gap : ''}`}>
                    <Clock className="h-3 w-3" />{positionText}
                </span>
            )}
            <span className={`inline-flex items-center gap-1 ${subject.discussion.kind === 'none' ? gap : ''}`}>
                <Mic className="h-3 w-3" />{kindText}
            </span>
            <span className={`inline-flex items-center gap-1 ${attendanceLabel ? '' : gap}`}>
                <Users className="h-3 w-3" />{attendanceLabel ?? tPage('metaNoAttendance')}
            </span>
            <span className={`inline-flex items-center gap-1 ${voteLabel ? '' : gap}`}>
                <Vote className="h-3 w-3" />{voteLabel ?? tPage('metaNoVote')}
            </span>
        </div>
    );
}
