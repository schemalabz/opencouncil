'use client';

import { AIDisclosurePopover } from '@/components/AIDisclosure';
import { AIGeneratedLabel } from '@/components/AIGeneratedLabel';
import { cn } from '@/lib/utils';

interface AIGeneratedBadgeProps {
    className?: string;
}

/**
 * The notice beside a text the model wrote. The label is the disclosure's
 * trigger, so a reader who wants to know what "AI-generated" means here gets
 * the same explanation the robot on a picture gives.
 */
export function AIGeneratedBadge({ className = '' }: AIGeneratedBadgeProps) {
    return (
        <div className={cn('flex items-center text-xs text-muted-foreground', className)}>
            <AIDisclosurePopover kind="text">
                <button
                    type="button"
                    className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <AIGeneratedLabel className="text-inherit" />
                </button>
            </AIDisclosurePopover>
        </div>
    );
}
