'use client';

import { Fragment } from 'react';
import { Bell, ChevronDown, Mail, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

    if (isSubscribed) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="lg"
                        variant="outline"
                        className={cn('justify-between', fullWidth ? 'w-full' : 'w-full sm:w-auto', className)}
                    >
                        <span className="flex items-center">
                            <Bell className="w-4 h-4 mr-2" />
                            {t('manageTitle')}
                        </span>
                        <ChevronDown className="w-4 h-4 ml-2 opacity-60" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                    <p className="px-2 py-1.5 text-xs leading-snug text-muted-foreground">
                        {t('manageSubtitle')}
                    </p>
                    <DropdownMenuItem onClick={onClick} className="cursor-pointer">
                        <Bell className="w-4 h-4 mr-2 flex-shrink-0" />
                        {t('manageAction')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

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
                className={fullWidth ? 'w-full' : 'w-full sm:w-auto'}
            >
                <Bell className="w-4 h-4 mr-2" />
                {t('title')}
            </Button>
            <p className="text-xs leading-snug text-muted-foreground">
                {t('subtitle')}
                <span className="sm:hidden">
                    {CHANNELS.map((channel) => (
                        <Fragment key={`m-${channel.label}`}>
                            <span className="mx-1.5 opacity-40" aria-hidden="true">·</span>
                            <ChannelChip {...channel} />
                        </Fragment>
                    ))}
                </span>
            </p>
            <div className="hidden sm:flex sm:justify-between text-[11px] text-muted-foreground">
                {CHANNELS.map((channel) => (
                    <ChannelChip key={`d-${channel.label}`} {...channel} />
                ))}
            </div>
        </div>
    );
}
