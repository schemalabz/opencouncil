'use client';

import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EXCERPT_SHARE_EVENT, type ExcerptShareEventDetail } from './ExcerptSelectionToolbar';

export function SegmentShareButton({ utteranceIds }: { utteranceIds: string[] }) {
    const t = useTranslations('sharing');
    if (!utteranceIds.length) return null;
    return <Tooltip>
        <TooltipTrigger asChild>
            <Button variant="ghost" size="icon"
                className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-[hsl(var(--orange)/0.08)] hover:text-[hsl(var(--orange-deep))]"
                aria-label={t('shareSegment')}
                onClick={event => event.currentTarget.closest('[data-excerpt-root]')?.dispatchEvent(
                    new CustomEvent<ExcerptShareEventDetail>(EXCERPT_SHARE_EVENT, { detail: { utteranceIds } })
                )}>
                <Share2 className="size-4" />
            </Button>
        </TooltipTrigger>
        <TooltipContent>{t('shareSegment')}</TooltipContent>
    </Tooltip>;
}
