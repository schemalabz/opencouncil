"use client";

import { Check } from "lucide-react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { AdminBodyGroup } from "./hooks/useSearchFilterData";
import type { FilterPatch, SearchFilterParams } from "./searchFilterTypes";

/**
 * The option rows shared by the two /search filter surfaces — the desktop pill
 * row (SearchFilters) and the mobile panel (SearchFilterSections). They present
 * the same six filters with different chrome; the rows inside the lists are the
 * same rows, so they live here rather than being written twice.
 */

/** One row of a filter list: a check column, then the label. */
export function FilterListItem({
    searchValue,
    label,
    selected,
    muted = false,
    className,
    onSelect,
}: {
    /** The row's cmdk value — what a CommandInput matches against, and the tie
     *  breaker between same-named rows. Admin bodies fold their type label in,
     *  so "επιτροπή" finds every committee, not only bodies with it in the name,
     *  and two bodies named alike under different types stay distinct. */
    searchValue: string;
    label: string;
    selected: boolean;
    muted?: boolean;
    className?: string;
    onSelect: () => void;
}) {
    return (
        <CommandItem value={searchValue} onSelect={onSelect} className={className}>
            <Check className={cn("mr-2 h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
            <span className={cn("truncate", muted && "text-muted-foreground")}>{label}</span>
        </CommandItem>
    );
}

/**
 * The administrative body list: bodies grouped under their type's heading, each
 * group led by an "all of this type" row when it holds more than one body.
 *
 * One searchable list rather than two rows of badges: a city like Athens has a
 * dozen bodies, which a badge grid stacks one per row. Grouping by type keeps
 * the two levels legible — the heading gives each "all of this type" row the
 * context a bare badge lacked.
 */
export function AdminBodyOptions({
    bodyGroups,
    filters,
    setFilters,
    allBodiesLabel,
    itemClassName,
    onSelected,
}: {
    bodyGroups: AdminBodyGroup[];
    filters: SearchFilterParams;
    setFilters: (patch: FilterPatch) => void;
    allBodiesLabel: string;
    itemClassName?: string;
    /** Closes the popover / collapses the section after a pick. */
    onSelected: () => void;
}) {
    return (
        <>
            {bodyGroups.map(group => (
                <CommandGroup key={group.type} heading={group.typeLabel}>
                    {group.bodies.length > 1 && (
                        <FilterListItem
                            searchValue={`${group.typeLabel} ${allBodiesLabel}`}
                            label={allBodiesLabel}
                            muted
                            className={itemClassName}
                            selected={filters.adminBodyType === group.type && !filters.adminBodyId}
                            onSelect={() => {
                                setFilters({ adminBodyType: group.type, adminBodyId: undefined });
                                onSelected();
                            }}
                        />
                    )}
                    {group.bodies.map(body => (
                        <FilterListItem
                            key={body.value}
                            searchValue={`${group.typeLabel} ${body.label}`}
                            label={body.label}
                            className={itemClassName}
                            selected={filters.adminBodyId === body.value}
                            onSelect={() => {
                                // Both, so the pill/section label and any future
                                // type-level filter stay consistent.
                                setFilters({ adminBodyType: group.type, adminBodyId: body.value });
                                onSelected();
                            }}
                        />
                    ))}
                </CommandGroup>
            ))}
        </>
    );
}
