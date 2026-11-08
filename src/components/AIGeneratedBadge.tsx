'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AIDisclosurePopover } from '@/components/AIDisclosure';
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
    const t = useTranslations('Common');
    return (
        <div className={cn('flex items-center text-xs text-muted-foreground', className)}>
            <AIDisclosurePopover kind="text">
                <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Bot className="h-3 w-3" aria-hidden />
                    <span>{t('aiGenerated')}</span>
                </button>
            </AIDisclosurePopover>
        </div>
    );
}
