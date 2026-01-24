import { Bot } from 'lucide-react';

interface AIGeneratedBadgeProps {
    className?: string;
}

export function AIGeneratedBadge({ className = '' }: AIGeneratedBadgeProps) {
    return (
        <div className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}>
            <Bot className="h-3 w-3" />
            <span>Κείμενο από ΤΝ</span>
        </div>
    );
}
