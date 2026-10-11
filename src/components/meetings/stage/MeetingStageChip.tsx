import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PublicMeetingStage } from '@/lib/meetingStage';
import { StageRing } from './StageRing';

/** The colour the ring and the word take. Only the two stages that need attention get one. */
const TONE: Record<PublicMeetingStage, string> = {
    upcoming: 'text-[hsl(var(--orange-deep))]',
    live: 'text-red-700',
    waiting: 'text-muted-foreground',
    transcribing: 'text-muted-foreground',
    review: 'text-muted-foreground',
    complete: 'text-muted-foreground',
    archive: 'text-muted-foreground',
};

const SIZE = {
    /** Beside the facts of a page header, or a title: 14px on a desktop, 12px on a phone. */
    md: { text: 'text-xs sm:text-sm', gap: 'gap-1.5', ring: 14 },
    /** Beside the 12px facts of a card, a timeline block, a rail row. */
    sm: { text: 'text-xs', gap: 'gap-1', ring: 12 },
} as const;

interface MeetingStageChipProps {
    stage: PublicMeetingStage;
    /** The soft second half: a countdown, a deadline. */
    detail?: string | null;
    size?: keyof typeof SIZE;
    className?: string;
}

/**
 * The stage as a fact among facts, not a badge: the ring where an icon would
 * sit, the stage word in the stage's colour, the detail in the row's own grey.
 * No pill, no wash — nothing else in the app wears one. The same anatomy on
 * every surface, so a reader learns it once. The meeting page's strip carries
 * the one link to the explainer.
 */
export function MeetingStageChip({ stage, detail, size = 'md', className }: MeetingStageChipProps) {
    const t = useTranslations('meetingStage');
    const { text, gap, ring } = SIZE[size];

    // leading-none after the size class: tailwind-merge drops a line-height that precedes a font size.
    return (
        <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap', text, 'leading-none', gap, className)}>
            <span className={cn('inline-flex', TONE[stage])}>
                <StageRing stage={stage} size={ring} />
            </span>
            {/* Centred like every other icon beside text in the app: on the cap
                height of the word, which is where the calendar and file glyphs
                of the facts row sit. Measured, not eyeballed. */}
            <span className={cn('font-semibold', TONE[stage])}>{t(`label.${stage}`)}</span>
            {/* Clock-relative on the upcoming and review chips; the server and
                the client may format it a moment apart. */}
            {detail && <span className="text-muted-foreground" suppressHydrationWarning>· {detail}</span>}
        </span>
    );
}
