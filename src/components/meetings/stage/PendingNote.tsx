'use client';
import { useTranslations } from 'next-intl';
import type { PendingKind } from '@/lib/meetingStage';
import { PendingBox } from './PendingBox';

/**
 * What an empty summary or statements section says while the meeting is on
 * its way: the piece is coming, and when. Silence there read as "nobody
 * spoke", which is the opposite of the truth.
 */
export function PendingNote({ what, kind, deadline, className }: {
    what: 'summary' | 'statements';
    kind: PendingKind;
    deadline: Date | null;
    className?: string;
}) {
    const t = useTranslations('meetingStage');
    // A transcript on its way makes the same promise as a meeting ahead: the piece comes after it.
    const copy = kind === 'processing' ? 'before' : kind;
    return (
        <PendingBox deadline={kind === 'review' ? deadline : null} className={className}>
            {t(`subject.${what}.${copy}`)}
        </PendingBox>
    );
}
