'use client';
import { MeetingStageChip } from './MeetingStageChip';
import { useMeetingStage } from './useMeetingStage';

/**
 * The stage beside the meeting's name in the top bar, so it stays in view
 * while the page scrolls. The word alone, from `lg` up: the bar also holds
 * the previous/next pair and the page's controls, and the name is what must
 * survive — the header band below carries the chip with its detail on every
 * width. Nothing renders once the meeting is complete.
 */
export function MeetingHeaderStage() {
    const { stage } = useMeetingStage();
    if (stage === 'complete') return null;
    return <MeetingStageChip stage={stage} className="hidden lg:inline-flex" />;
}
