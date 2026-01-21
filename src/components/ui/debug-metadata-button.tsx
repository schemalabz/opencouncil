'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { JsonMetadataDialog } from '@/components/ui/json-metadata-dialog';
import { FileJson } from 'lucide-react';

type MetadataItem = {
    label: string;
    value: string | number | ReactNode;
    icon?: ReactNode;
};

type BadgeItem = {
    label: string;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
    icon?: ReactNode;
};

type DebugMetadataButtonProps = {
    data: unknown;
    title?: string;
    metadata?: MetadataItem[];
    badges?: BadgeItem[];
    tooltip?: string;
    triggerLabel?: string;
    icon?: ReactNode;
    buttonProps?: Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>;
};

/**
 * Small helper to drop a “view metadata” trigger that opens the shared JSON dialog.
 * Keeps the trigger styling/UX consistent across components.
 */
export function DebugMetadataButton({
    data,
    title = 'Metadata',
    metadata,
    badges,
    tooltip = 'View metadata',
    triggerLabel,
    icon,
    buttonProps
}: DebugMetadataButtonProps) {
    const [open, setOpen] = useState(false);
    const triggerIcon = icon ?? <FileJson className="h-4 w-4" />;

    const handleClick: ComponentProps<typeof Button>['onClick'] = (event) => {
        event.stopPropagation();
        setOpen(true);
    };

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size={triggerLabel ? 'sm' : 'icon'}
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            {...buttonProps}
                            onClick={handleClick}
                        >
                            {triggerIcon}
                            {triggerLabel ? <span className="ml-2">{triggerLabel}</span> : null}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{tooltip}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <JsonMetadataDialog
                open={open}
                onOpenChange={setOpen}
                title={title}
                data={data}
                metadata={metadata}
                badges={badges}
            />
        </>
    );
}

