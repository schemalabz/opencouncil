import { cn } from '@/lib/utils';
import type { PublicMeetingStage } from '@/lib/meetingStage';

/** Circumference of the r=5 ring in the 14-unit box. */
const RING = 2 * Math.PI * 5;

/**
 * How much of the ring each stage has filled, and what colour the fill takes.
 * The base ring is the chip's text colour at low opacity; the arc is the one
 * accent the stage owns.
 */
const FILL: Record<PublicMeetingStage, { fraction: number; arc: string; dashed?: boolean; spin?: boolean }> = {
    upcoming: { fraction: 0, arc: '', dashed: true },
    live: { fraction: 0, arc: '' },
    waiting: { fraction: 0.25, arc: 'stroke-current' },
    transcribing: { fraction: 0.5, arc: 'stroke-[hsl(var(--orange))]', spin: true },
    review: { fraction: 0.75, arc: 'stroke-yellow-600' },
    complete: { fraction: 1, arc: 'stroke-green-600' },
    archive: { fraction: 0, arc: '' },
};

/**
 * The stage glyph: a ring that fills as a meeting moves through the pipeline.
 * Dashed and empty before the meeting, a pulsing dot while it runs, then a
 * quarter (waiting for video), a half (transcribing, turning), three quarters
 * (under review) and a ticked full ring (complete). Archive is an empty ring.
 */
export function StageRing({ stage, size = 14, className }: { stage: PublicMeetingStage; size?: number; className?: string }) {
    if (stage === 'live') {
        return (
            <span
                className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
                style={{ width: size, height: size }}
                aria-hidden
            >
                <span className="absolute h-2/3 w-2/3 rounded-full bg-red-600 opacity-60 motion-safe:animate-ping" />
                <span className="relative h-1/2 w-1/2 rounded-full bg-red-600" />
            </span>
        );
    }
    const { fraction, arc, dashed, spin } = FILL[stage];
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" className={cn('shrink-0 overflow-visible', className)} aria-hidden>
            <circle
                cx="7" cy="7" r="5" fill="none" strokeWidth="2"
                className="stroke-current opacity-30"
                strokeDasharray={dashed ? '2.3 2' : undefined}
            />
            {fraction > 0 && (
                <g className={spin ? 'origin-center [transform-box:view-box] motion-safe:animate-[spin_3.2s_linear_infinite]' : undefined}>
                    <circle
                        cx="7" cy="7" r="5" fill="none" strokeWidth="2"
                        className={arc}
                        strokeDasharray={`${fraction * RING} ${RING}`}
                        transform="rotate(-90 7 7)"
                    />
                </g>
            )}
            {stage === 'complete' && (
                <path
                    d="M4.7 7.3l1.6 1.6 3.1-3.4" fill="none" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="stroke-green-600"
                />
            )}
        </svg>
    );
}
