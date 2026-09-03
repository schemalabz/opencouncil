import { TopicIcon } from '@/components/TopicIcon';
import { cn } from '@/lib/utils';
import type { BarBand } from '@/lib/utils/barTimeline';

/**
 * The party dot and the speaker's name. `rail` centres the dot on the 24px
 * rail the topic badge below it uses when the two stack.
 */
export function SpeakerLine({ band, rail = false, strong = false, className }: { band: BarBand; rail?: boolean; strong?: boolean; className?: string }) {
    if (!band.speakerName) return null;
    return (
        <div className={cn('flex min-w-0 items-center gap-2', className)}>
            <span className={cn('flex shrink-0 justify-center', rail && 'w-6')} aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.speakerColor }} />
            </span>
            <span className={cn('truncate text-xs', strong ? 'font-extrabold' : 'font-bold')}>{band.speakerName}</span>
        </div>
    );
}

/** The topic badge and the subject's name; stacked it may wrap, in a row it truncates. */
export function SubjectLine({ band, rail = false, className }: { band: BarBand; rail?: boolean; className?: string }) {
    if (!band.subjectName) return null;
    return (
        <div className={cn('flex min-w-0 gap-2', rail ? 'items-start' : 'items-center', className)}>
            <TopicIcon color={band.subjectColor} icon={band.subjectIcon} size="sm" />
            <span className={cn('min-w-0 text-xs leading-snug', rail ? 'pt-0.5' : 'truncate')}>{band.subjectName}</span>
        </div>
    );
}

/**
 * Who speaks and on what at a hovered time. The tooltip stacks the two
 * lines on short meetings; the lens header lays them out inline on long ones.
 */
export function HoverBandDetails({ band, inline = false }: { band: BarBand | null; inline?: boolean }) {
    if (!band) return null;
    return (
        <>
            <SpeakerLine band={band} rail={!inline} className={inline ? undefined : 'mt-1.5'} />
            <SubjectLine band={band} rail={!inline} className={inline ? undefined : 'mt-1.5'} />
        </>
    );
}
