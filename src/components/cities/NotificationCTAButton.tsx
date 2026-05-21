'use client';

import { Fragment } from 'react';
import { Bell, Mail, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
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

function ChannelChip({ label, Icon }: { label: string; Icon: LucideIcon }) {
    return (
        <span className="inline-flex items-center gap-1 align-middle">
            <Icon className="h-3 w-3" />
            {label}
        </span>
    );
}

export function NotificationCTAButton({
    onClick,
    isSubscribed = false,
    fullWidth = false,
    className,
}: NotificationCTAButtonProps) {
    const t = useTranslations('City.notificationsCta');
    const title = isSubscribed ? t('manageTitle') : t('title');
    const subtitle = isSubscribed ? t('manageSubtitle') : t('subtitle');

    return (
        <div
            className={cn(
                'flex flex-col gap-2',
                fullWidth ? 'w-full' : 'w-full sm:max-w-sm',
                className,
            )}
        >
            <Button
                onClick={onClick}
                size="lg"
                variant={isSubscribed ? 'outline' : 'default'}
                className={fullWidth ? 'w-full' : 'w-full sm:w-auto'}
            >
                <Bell className="w-4 h-4 mr-2" />
                {title}
            </Button>
            <p className="text-xs leading-snug text-muted-foreground">
                {subtitle}
                {!isSubscribed && (
                    <span className="sm:hidden">
                        {CHANNELS.map((channel) => (
                            <Fragment key={`m-${channel.label}`}>
                                <span className="mx-1.5 opacity-40" aria-hidden="true">·</span>
                                <ChannelChip {...channel} />
                            </Fragment>
                        ))}
                    </span>
                )}
            </p>
            {!isSubscribed && (
                <div className="hidden sm:flex sm:justify-between text-[11px] text-muted-foreground">
                    {CHANNELS.map((channel) => (
                        <ChannelChip key={`d-${channel.label}`} {...channel} />
                    ))}
                </div>
            )}
        </div>
    );
}
