'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import { Eyebrow } from './SignupChrome';

export interface MeanwhileLink {
    href: string;
    icon: LucideIcon;
    title: string;
    hint: string;
}

/** Where to go once a flow is done: a short list of exits, each a row. */
export function MeanwhileLinks({ eyebrow, items, className }: { eyebrow: string; items: MeanwhileLink[]; className?: string }) {
    return (
        <div className={className}>
            <Eyebrow className="block">{eyebrow}</Eyebrow>
            <div className={cn(surfaceCardClass, 'mt-2.5 overflow-hidden')}>
                {items.map(({ href, icon: Icon, title, hint }, index) => (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            'flex min-h-14 items-center gap-3 px-3 py-2.5 hover:no-underline',
                            index > 0 && 'border-t border-border/60',
                        )}
                    >
                        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-muted">
                            <Icon className="h-4 w-4 text-foreground/70" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] leading-tight">{title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                ))}
            </div>
        </div>
    );
}
