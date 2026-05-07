'use client';

import { Bell, Mail, MessageCircle, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NotificationCTAButtonProps {
    onClick: () => void;
    isSubscribed?: boolean;
    fullWidth?: boolean;
    className?: string;
}

export function NotificationCTAButton({
    onClick,
    isSubscribed = false,
    fullWidth = false,
    className,
}: NotificationCTAButtonProps) {
    const title = isSubscribed ? 'Διαχείριση ειδοποιήσεων' : 'Μείνε ενημερωμένος';
    const subtitle = isSubscribed
        ? 'Αλλάξτε τις προτιμήσεις σας'
        : 'Λάβετε ενημερώσεις για τη συνεδρίαση';

    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                'group relative flex flex-col gap-2 rounded-xl border border-[hsl(var(--orange))]/30 bg-[hsl(var(--orange))]/5 px-4 py-3 text-left',
                'hover:border-[hsl(var(--orange))]/60 hover:bg-[hsl(var(--orange))]/10 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--orange))] focus-visible:ring-offset-2',
                fullWidth ? 'w-full' : 'w-full sm:w-auto',
                className,
            )}
            aria-label={title}
        >
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange))]/15 text-[hsl(var(--orange))]">
                    <Bell className="h-5 w-5" />
                </div>
                <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium leading-tight text-foreground sm:text-base">
                        {title}
                    </span>
                    <span className="text-xs leading-tight text-muted-foreground">
                        {subtitle}
                    </span>
                </div>
            </div>
            {!isSubscribed && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Email
                    </span>
                    <span className="opacity-40" aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        WhatsApp
                    </span>
                    <span className="opacity-40" aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        SMS
                    </span>
                </div>
            )}
        </motion.button>
    );
}
