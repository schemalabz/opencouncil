import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * The "AI-generated text" label on its own, with nothing to click. Cards that
 * are themselves one link use it: HTML forbids a button inside an anchor. The
 * embeds use it too, because they render as Server Components.
 */
export function AIGeneratedLabel({ className }: { className?: string }) {
    const t = useTranslations('Common');
    return (
        <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
            <Bot className="h-3 w-3 shrink-0" aria-hidden />
            <span>{t('aiGenerated')}</span>
        </span>
    );
}
