"use client";

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';
import type { MeetingListItem } from '@/lib/db/meetings';

interface ExpandableMetricCardProps {
    items: MeetingListItem[];
    label: string;
    /** Pre-formatted secondary line, e.g. "Oldest: 3 months ago" */
    subtext?: string;
    /** How each row's date is shown: relative ("3 months ago") or absolute date/time */
    timeDisplay: 'relative' | 'absolute';
}

export function ExpandableMetricCard({ items, label, subtext, timeDisplay }: ExpandableMetricCardProps) {
    const [open, setOpen] = useState(false);
    const expandable = items.length > 0;

    // The page's 30-day filter can empty the list while this client component
    // survives the navigation; drop stale open state so the card doesn't
    // spring open when items reappear.
    useEffect(() => {
        if (!expandable) setOpen(false);
    }, [expandable]);

    return (
        <Card className="overflow-hidden">
            <Collapsible open={expandable && open} onOpenChange={setOpen} disabled={!expandable}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "w-full text-left",
                            expandable && "hover:bg-muted/20 transition-colors"
                        )}
                        aria-label={expandable ? `${open ? 'Collapse' : 'Expand'} ${label} list` : undefined}
                    >
                        <CardContent className="pt-6 relative">
                            <div className="text-2xl font-bold">{items.length}</div>
                            <div className="text-sm text-muted-foreground mt-1">{label}</div>
                            {subtext && (
                                <div className="text-xs text-muted-foreground mt-2">{subtext}</div>
                            )}
                            {expandable && (
                                <ChevronDown
                                    className={cn(
                                        "absolute top-6 right-6 h-4 w-4 text-muted-foreground transition-transform",
                                        open && "rotate-180"
                                    )}
                                />
                            )}
                        </CardContent>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                    <ScrollArea className="border-t" viewportClassName="max-h-64">
                        <ItemGroup>
                            {items.map((meeting, index) => (
                                <Fragment key={`${meeting.cityId}-${meeting.id}`}>
                                    {index > 0 && <ItemSeparator />}
                                    <Item size="sm" className="rounded-none px-6 py-2" asChild>
                                        <Link href={`/${meeting.cityId}/${meeting.id}`} target="_blank" rel="noopener noreferrer">
                                            <ItemContent className="min-w-0 gap-0">
                                                <ItemTitle className="truncate">{`${meeting.cityId}/${meeting.id}`}</ItemTitle>
                                                {meeting.administrativeBodyName && (
                                                    <ItemDescription className="line-clamp-1 text-xs">
                                                        {meeting.administrativeBodyName}
                                                    </ItemDescription>
                                                )}
                                            </ItemContent>
                                            <div className="text-xs text-muted-foreground shrink-0">
                                                {timeDisplay === 'relative'
                                                    ? formatDistanceToNow(meeting.dateTime, { addSuffix: true })
                                                    : formatDateTime(meeting.dateTime, undefined, 'medium')}
                                            </div>
                                        </Link>
                                    </Item>
                                </Fragment>
                            ))}
                        </ItemGroup>
                    </ScrollArea>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
