'use client';

import { Fragment } from 'react';
import { Bell, Mail, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationCTAButtonProps {
    onClick: () => void;
    isSubscribed?: boolean;
    fullWidth?: boolean;
    className?: string;
}

const CHANNELS: ReadonlyArray<{ label: string; Icon: LucideIcon }> = [
    { label: 'Email', Icon: Mail },
    { label: 'WhatsApp', Icon: MessageCircle },
    { label: 'SMS', Icon: MessageSquare },
];

export function NotificationCTAButton({
    onClick,
    isSubscribed = false,
    fullWidth = false,
    className,
}: NotificationCTAButtonProps) {
    const title = isSubscribed ? 'Διαχείριση ειδοποιήσεων' : 'Μείνε ενημερωμένος';
    const subtitle = isSubscribed
        ? 'Αλλάξτε τις προτιμήσεις σας'
        : 'Μπορούμε να σας στέλνουμε ένα μήνυμα όποτε ο δήμος συζητάει κάτι για την γειτονιά σας!';

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={title}
            className={cn(
                'group relative flex flex-col gap-2 rounded-xl border border-[hsl(var(--orange))]/30 bg-[hsl(var(--orange))]/5 px-4 py-3 text-left',
                'transition-all hover:-translate-y-px hover:border-[hsl(var(--orange))]/60 hover:bg-[hsl(var(--orange))]/10 active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--orange))] focus-visible:ring-offset-2',
                fullWidth ? 'w-full' : 'w-full sm:w-auto sm:max-w-md',
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange))]/15 text-[hsl(var(--orange))]">
                    <Bell className="h-5 w-5" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-tight text-foreground sm:text-base">
                        {title}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">
                        {subtitle}
                    </span>
                </div>
            </div>
            {!isSubscribed && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-[11px] text-muted-foreground">
                    {CHANNELS.map(({ label, Icon }, i) => (
                        <Fragment key={label}>
                            {i > 0 && <span className="opacity-40" aria-hidden="true">·</span>}
                            <span className="inline-flex items-center gap-1">
                                <Icon className="h-3 w-3" />
                                {label}
                            </span>
                        </Fragment>
                    ))}
                </div>
            )}
        </button>
    );
}
