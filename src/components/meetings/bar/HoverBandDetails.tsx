import { TopicIcon } from '@/components/TopicIcon';
import { cn } from '@/lib/utils';
import type { BarBand } from '@/lib/utils/barTimeline';

/**
 * Who speaks and on what at a hovered time: the party dot and the speaker,
 * the topic badge and the subject. The tooltip stacks it on short meetings;
 * the lens header lays it out inline on long ones.
 */
export function HoverBandDetails({ band, inline = false }: { band: BarBand | null; inline?: boolean }) {
    if (!band) return null;
    return (
        <>
            {band.speakerName && (
                <div className={cn('flex items-center gap-2', inline ? 'min-w-0' : 'mt-1.5')}>
                    {/* the party dot, as parties are marked everywhere else — stacked, it
                        centres on the same 24px rail as the topic badge below it */}
                    <span className={cn('flex shrink-0 justify-center', inline ? 'w-auto' : 'w-6')} aria-hidden>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.speakerColor }} />
                    </span>
                    <span className="truncate text-xs font-bold">{band.speakerName}</span>
                </div>
            )}
            {band.subjectName && (
                <div className={cn('flex gap-2', inline ? 'min-w-0 items-center' : 'mt-1.5 items-start')}>
                    <TopicIcon color={band.subjectColor} icon={band.subjectIcon} size="sm" />
                    <span className={cn('min-w-0 text-xs leading-snug', inline ? 'truncate' : 'pt-0.5')}>{band.subjectName}</span>
                </div>
            )}
        </>
    );
}
