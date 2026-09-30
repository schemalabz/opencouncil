import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { useTranslations } from 'next-intl';
import { SpeakerTag } from "@prisma/client";
import { ImageOrInitials } from "../ImageOrInitials";
import { cn, filterActiveRoles, getPartyFromRoles, relevanceScore, UNKNOWN_SPEAKER_LABEL } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, X, Edit2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonWithRelations } from '@/lib/db/people';
import { RoleDisplay } from './RoleDisplay';
import { formatSurnameFirst } from '@/lib/formatters/name';
import { useLocalizeText } from '@/hooks/useLocalizeText';
import type { SpeakerAssignment, SpeakerAssignmentScope } from '@/lib/db/speakerTags';

interface PersonDisplayProps {
    person?: PersonWithRelations;
    speakerTag?: SpeakerTag;
    segmentCount?: number;
    short?: boolean;
    className?: string;
    preferFullName?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    editable?: boolean;
    onClick?: () => void;
    nonInteractive?: boolean;
    /** Resolve the party color as of this date (e.g. the meeting date) instead of today. */
    date?: Date;
}

// A simpler version of PersonBadge used in search results
function PersonDisplay({ person, speakerTag, segmentCount, short = false, preferFullName = false, size = 'md', editable = false, onClick, nonInteractive = false, date }: PersonDisplayProps) {
    const localize = useLocalizeText();
    const t = useTranslations('transcript.speakerPicker');
    const activeRoles = person ? filterActiveRoles(person.roles) : [];
    const party = person ? getPartyFromRoles(person.roles, date) : null;
    const partyColor = party?.colorHex || 'gray';

    const imageSizes = {
        sm: 40,
        md: 48,
        lg: 64,
        xl: 96
    };

    const imageSize = imageSizes[size];

    const nameTextSize = size === 'lg' || size === 'xl' ? 'text-lg' : 'text-base';
    const roleTextSize = size === 'sm' ? 'text-xs' : 'text-sm';

    return (
        <div className="flex items-center gap-3 w-full min-w-0">
            <div
                className={cn(
                    "relative shrink-0",
                    size === 'sm' && "w-8 h-8 sm:w-10 sm:h-10",
                    size === 'md' && "w-10 h-10 sm:w-12 sm:h-12",
                    size === 'lg' && "w-12 h-12 sm:w-16 sm:h-16",
                    size === 'xl' && "w-16 h-16 sm:w-24 sm:h-24",
                    !editable && !nonInteractive && "cursor-pointer"
                )}
                onClick={nonInteractive ? undefined : onClick}
                role={nonInteractive ? undefined : "button"}
                tabIndex={nonInteractive ? undefined : 0}
                onKeyPress={nonInteractive ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        onClick?.();
                    }
                }}
            >
                <div
                    className={cn(
                        "absolute inset-0 rounded-full opacity-20",
                        party && `bg-[${partyColor}]`
                    )}
                />
                <ImageOrInitials
                    imageUrl={person?.image || null}
                    name={person?.name}
                    width={imageSize}
                    height={imageSize}
                    color={partyColor}
                />
            </div>
            {!short && (
                <div className="flex flex-col justify-center min-w-0 flex-1">
                    <div className={cn("font-medium text-foreground truncate sm:whitespace-normal sm:break-words", nameTextSize, size === 'sm' && "text-sm sm:text-base")}>
                        {person ? (
                            localize(preferFullName ? person.name : formatSurnameFirst(person.name))
                        ) : (
                            speakerTag?.label && localize(speakerTag.label)
                        )}
                        {editable && segmentCount !== undefined && (
                            <span className="hidden sm:inline ml-2 text-muted-foreground font-normal">
                                ({t('segmentCount', { count: segmentCount })})
                            </span>
                        )}
                    </div>

                    {/* Display roles using RoleDisplay component */}
                    <div className="mt-0.5 sm:mt-1.5">
                        <RoleDisplay
                            roles={activeRoles}
                            size={size === 'sm' ? 'sm' : 'md'}
                            layout="compact"
                            showIcons={false}
                            borderless={true}
                            className={cn(roleTextSize, "text-[10px] sm:text-xs")}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function SegmentScopeFooter({ segmentCount, onlyThisSegment, onOnlyThisSegmentChange }: {
    segmentCount: number;
    onlyThisSegment: boolean;
    onOnlyThisSegmentChange: (value: boolean) => void;
}) {
    const t = useTranslations('transcript.speakerPicker');
    const checkboxId = useId();

    return (
        <div className="flex flex-col gap-1 border-t bg-muted/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
                <Checkbox
                    id={checkboxId}
                    aria-describedby={`${checkboxId}-hint`}
                    checked={onlyThisSegment}
                    onCheckedChange={(checked) => onOnlyThisSegmentChange(checked === true)}
                />
                <label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium leading-none">
                    {t('onlyThisSegment')}
                </label>
            </div>
            <p id={`${checkboxId}-hint`} className="pl-6 text-xs text-muted-foreground">
                {t('onlyThisSegmentHint', { others: segmentCount - 1 })}
            </p>
        </div>
    );
}

interface PersonBadgeProps extends PersonDisplayProps {
    withBorder?: boolean;
    isSelected?: boolean;
    /** Applies the picked person or label. The picker offers the `thisSegment` scope when the tag has 2 or more segments. */
    onAssign?: (assignment: SpeakerAssignment, scope: SpeakerAssignmentScope) => void;
    availablePeople?: PersonWithRelations[];
    nextUnknownLabel?: string;
    variant?: 'default' | 'inline';
    /** When true, the badge does not navigate or behave like a button (useful on the person's own page). */
    disableNavigation?: boolean;
}

function PersonBadge({
    person,
    speakerTag,
    segmentCount,
    short = false,
    className,
    withBorder,
    isSelected = false,
    editable = false,
    onAssign,
    availablePeople,
    nextUnknownLabel,
    preferFullName = false,
    size = 'md',
    variant = 'default',
    disableNavigation = false,
    date,
}: PersonBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [onlyThisSegment, setOnlyThisSegment] = useState(false);
    const localize = useLocalizeText();
    const t = useTranslations('transcript.speakerPicker');
    const router = useRouter();
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = 0;
        }
    }, [searchQuery, isOpen]);

    // Rank and filter people by relevance to the typed query — prefix and
    // word-start matches outrank plain substrings, with Greek accents/case
    // normalized (see issue #305). We drive ranking here and disable the
    // Command's own filtering (`shouldFilter={false}`) so the static fallback
    // actions (unknown speaker, set label, remove) always stay visible; cmdk
    // would otherwise score them zero and hide them while typing.
    const rankedPeople = useMemo(() => {
        const people = availablePeople ?? [];
        const query = searchQuery.trim();
        if (!query) return people;
        return people
            .map((p) => ({
                person: p,
                score: relevanceScore(
                    [p.name, p.name_short, p.name_en, p.name_short_en].filter(Boolean).join(' '),
                    query
                ),
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ person }) => person);
    }, [availablePeople, searchQuery]);

    // The scope choice lasts for one opening of the picker, so the common case
    // (change every segment of the tag) never needs an extra step.
    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (!open) setOnlyThisSegment(false);
    };

    const canScopeToSegment = (segmentCount ?? 0) > 1;

    const applyAssignment = (personId: string | null, label?: string) => {
        onAssign?.({ personId, label }, canScopeToSegment && onlyThisSegment ? 'thisSegment' : 'allSegments');
        handleOpenChange(false);
    };

    const handleSetLabel = (label: string) => applyAssignment(null, label);

    const handlePersonClick = () => {
        if (editable) {
            setIsOpen(true);
        } else if (person && !disableNavigation) {
            router.push(`/${person.cityId}/people/${person.id}`);
        }
    };

    // Inline variant - minimal display with just party dot and name
    if (variant === 'inline') {
        const party = person ? getPartyFromRoles(person.roles, date) : null;
        return (
            <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
                {party && (
                    <div
                        className="w-2 h-2 rounded-full shrink-0"
                        aria-hidden="true"
                        style={{ backgroundColor: party.colorHex }}
                    />
                )}
                <span className="text-sm font-medium truncate">
                    {person ? (
                        localize(preferFullName ? person.name : formatSurnameFirst(person.name))
                    ) : (
                        speakerTag?.label && localize(speakerTag.label)
                    )}
                </span>
            </div>
        );
    }

    const isInteractive = editable || !disableNavigation;
    const badge = (
        <div
            className={cn(
                "relative flex items-center gap-2 rounded-lg p-1.5 sm:p-2 min-w-0",
                withBorder && "border",
                isSelected && "bg-accent",
                editable && "cursor-pointer hover:bg-accent/50",
                !editable && !disableNavigation && "cursor-pointer hover:bg-accent/20",
                className
            )}
            onClick={isInteractive ? handlePersonClick : undefined}
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onKeyPress={isInteractive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handlePersonClick();
                }
            } : undefined}
        >
            <PersonDisplay
                person={person}
                speakerTag={speakerTag}
                segmentCount={segmentCount}
                short={short}
                preferFullName={preferFullName}
                size={size}
                editable={editable}
                nonInteractive={disableNavigation && !editable}
                date={date}
            />
            {editable && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-6 w-6 sm:h-8 sm:w-8 ml-auto"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}
                >
                    <Edit2 className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
            )}
        </div>
    );

    if (editable && availablePeople) {
        return (
            <Popover open={isOpen} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    {badge}
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput
                            autoFocus
                            placeholder={t('searchPlaceholder')}
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                        <CommandList ref={listRef}>
                            {/* cmdk's own filtering is disabled (shouldFilter=false);
                                we rank people and gate visibility here. While the user
                                is searching we show the ranked matches plus the "set
                                label" fallback; the quick actions (unknown speaker,
                                remove) show only when not searching. This keeps the top
                                match highlighted for Enter and stops a zero filter score
                                from hiding the fallback actions (the bug this fixes). */}
                            {!searchQuery && (
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => handleSetLabel(nextUnknownLabel || UNKNOWN_SPEAKER_LABEL)}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="w-10 h-10 relative shrink-0 flex items-center justify-center bg-muted rounded-full">
                                            <span className="text-xs font-medium">?</span>
                                        </div>
                                        <span className="font-medium">{nextUnknownLabel || UNKNOWN_SPEAKER_LABEL}</span>
                                    </CommandItem>
                                </CommandGroup>
                            )}
                            {rankedPeople.length > 0 && (
                                <CommandGroup>
                                    {rankedPeople.map((p) => (
                                        <CommandItem
                                            key={p.id}
                                            value={p.id}
                                            onSelect={() => applyAssignment(p.id)}
                                            className="flex items-center gap-2"
                                        >
                                            <Check
                                                className={cn(
                                                    "shrink-0 h-4 w-4",
                                                    person?.id === p.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <PersonDisplay
                                                person={p}
                                                size="sm"
                                                date={date}
                                            />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                            {searchQuery && (
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => handleSetLabel(searchQuery)}
                                    >
                                        <Edit2 className="mr-2 h-4 w-4" />
                                        {t('setLabel', { label: searchQuery })}
                                    </CommandItem>
                                </CommandGroup>
                            )}
                            {person && !searchQuery && (
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => applyAssignment(null)}
                                        className="text-destructive"
                                    >
                                        <X className="mr-2 h-4 w-4" />
                                        {t('removePerson')}
                                    </CommandItem>
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                    {canScopeToSegment && (
                        <SegmentScopeFooter
                            segmentCount={segmentCount ?? 0}
                            onlyThisSegment={onlyThisSegment}
                            onOnlyThisSegmentChange={setOnlyThisSegment}
                        />
                    )}
                </PopoverContent>
            </Popover>
        );
    }

    return badge;
}

export { PersonBadge };