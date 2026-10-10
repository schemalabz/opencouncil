'use client';

import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EXCERPT_SHARE_EVENT, type ExcerptShareEventDetail } from './ExcerptSelectionToolbar';

export function SegmentShareButton({ utteranceIds }: { utteranceIds: string[] }) {
    const t = useTranslations('sharing');
    if (!utteranceIds.length) return null;
    // A native title, not a Radix Tooltip: this button repeats once per speaker
    // segment, and a long meeting has hundreds of them.
    return <Button variant="ghost" size="icon"
        className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-[hsl(var(--orange)/0.08)] hover:text-[hsl(var(--orange-deep))]"
        aria-label={t('shareSegment')}
        title={t('shareSegment')}
        onClick={event => event.currentTarget.closest('[data-excerpt-root]')?.dispatchEvent(
            new CustomEvent<ExcerptShareEventDetail>(EXCERPT_SHARE_EVENT, { detail: { utteranceIds } })
        )}>
        <Share2 className="size-4" />
    </Button>;
}
