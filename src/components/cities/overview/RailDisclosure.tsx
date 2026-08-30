"use client";
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';

interface RailDisclosureProps {
    /** The one line that stands for the card while it is shut. */
    summary: string;
    children: React.ReactNode;
}

/**
 * A rail card that is shut on a phone and open in the sidebar.
 *
 * On a wide screen the rail is a column beside the tabs, so nothing it holds
 * costs the page anything. On a phone it stacks above them, and this card alone
 * ran a third of the screen — the tabs, which are what the reader came for,
 * started below two folds. Shut, it is one line and a chevron.
 *
 * From `lg` the summary goes and the body is simply there: no state to get
 * wrong, and a reader on a desktop never meets a control they do not need.
 */
export function RailDisclosure({ summary, children }: RailDisclosureProps) {
    const [open, setOpen] = useState(false);

    return (
        <div className={cn(surfaceCardClass, "overflow-hidden")}>
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-foreground/[0.03] lg:hidden"
            >
                <Image
                    src="/logo.png"
                    alt=""
                    width={26}
                    height={26}
                    className="h-[26px] w-[26px] shrink-0 rounded-full object-contain"
                />
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug">{summary}</span>
                <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
                    aria-hidden
                />
            </button>
            <div className={cn(open ? 'block' : 'hidden', 'lg:block')}>{children}</div>
        </div>
    );
}
