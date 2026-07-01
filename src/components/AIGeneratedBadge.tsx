import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AIGeneratedBadgeProps {
    className?: string;
}

export function AIGeneratedBadge({ className = '' }: AIGeneratedBadgeProps) {
    const t = useTranslations('Common');
    return (
        <div className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
            <Bot className="h-3 w-3" />
            <span>{t('aiGenerated')}</span>
        </div>
    );
}
