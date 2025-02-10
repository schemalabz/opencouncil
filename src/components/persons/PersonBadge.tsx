import React, { useState, useEffect } from 'react';
import { Person, Party, SpeakerTag } from "@prisma/client";
import { ImageOrInitials } from "../ImageOrInitials";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "../ui/badge";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, X, Edit2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { PersonWithRelations } from '@/lib/getMeetingData';

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
}

// A simpler version of PersonBadge used in search results
function PersonDisplay({ person, speakerTag, segmentCount, short = false, preferFullName = false, size = 'md', editable = false, onClick }: PersonDisplayProps) {
    const partyColor = person?.party?.colorHex || 'gray';

    const imageSizes = {
        sm: 40,
        md: 48,
        lg: 64,
        xl: 96
    };


    const imageSize = imageSizes[size];

    const switchOrder = (name: string | undefined) => {
        if (!name) return null;
        const parts = name.split(' ');
        return parts.length > 1 ? parts.reverse().join(' ') : name;
    };

    return (
        <div className="flex items-center gap-2 w-full">
            <div
                className={cn(
                    "relative shrink-0",
                    size === 'sm' && "w-10 h-10",
                    size === 'md' && "w-12 h-12",
                    size === 'lg' && "w-16 h-16",
                    size === 'xl' && "w-24 h-24",
                    !editable && "cursor-pointer"
                )}
                onClick={onClick}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        onClick?.();
                    }
                }}
            >
                <div
                    className={cn(
                        "absolute inset-0 rounded-full opacity-20",
                        person?.party && `bg-[${partyColor}]`
                    )}
                />
                <ImageOrInitials
                    imageUrl={person?.image || null}
                    name={person?.name || "Unknown"}
                    width={imageSize}
                    height={imageSize}
                    color={partyColor}
                />
            </div>
            {!short && (
                <div className="flex flex-col justify-center min-w-0 flex-1">
                    <div className="break-words">
                        {person ? (
                            preferFullName ? person.name : switchOrder(person.name)
                        ) : (
                            speakerTag?.label
                        )}
                        {editable && segmentCount !== undefined && (
                            <span className="ml-2 text-muted-foreground">
                                ({segmentCount} {segmentCount === 1 ? 'segment' : 'segments'})
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        {person?.party && (
                            <span
                                style={{ color: partyColor }}
                            >
                                {person.party.name_short}
                            </span>
                        )}
                        {person?.role && (
                            <>
                                {person.party && <span className="text-muted-foreground">·</span>}
                                <span className="text-muted-foreground break-words">
                                    {person.role}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface PersonBadgeProps extends PersonDisplayProps {
    withBorder?: boolean;
    isSelected?: boolean;
    onPersonChange?: (personId: string | null) => void;
    onLabelChange?: (label: string) => void;
    availablePeople?: PersonWithRelations[];
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
    onPersonChange,
    onLabelChange,
    availablePeople,
    preferFullName = false,
    size = 'md',
}: PersonBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editMode, setEditMode] = useState(false);
    const router = useRouter();

    const handlePersonClick = () => {
        if (editable) {
            setIsOpen(true);
        } else if (person) {
            router.push(`/${person.cityId}/people/${person.id}`);
        }
    };

    const badge = (
        <div
            className={cn(
                "relative flex items-center gap-2 rounded-lg p-1",
                withBorder && "border",
                isSelected && "bg-accent",
                editable && "cursor-pointer hover:bg-accent/50",
                !editable && "cursor-pointer hover:bg-accent/20",
                className
            )}
            onClick={handlePersonClick}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    handlePersonClick();
                }
            }}
        >
            <PersonDisplay
                person={person}
                speakerTag={speakerTag}
                segmentCount={segmentCount}
                short={short}
                preferFullName={preferFullName}
                size={size}
                editable={editable}
            />
            {editable && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(true);
                    }}
                >
                    <Edit2 className="h-4 w-4" />
                </Button>
            )}
        </div>
    );

    if (editable && availablePeople) {
        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    {badge}
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                    <Command>
                        <CommandInput
                            placeholder="Search people..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                        <CommandList>
                            <CommandEmpty>No results found</CommandEmpty>
                            <CommandGroup>
                                {availablePeople.map((p) => (
                                    <CommandItem
                                        key={p.id}
                                        onSelect={() => {
                                            onPersonChange?.(p.id);
                                            setIsOpen(false);
                                        }}
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
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            {searchQuery && (
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => {
                                            onPersonChange?.(null);
                                            onLabelChange?.(searchQuery);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <Edit2 className="mr-2 h-4 w-4" />
                                        Set label to &quot;{searchQuery}&quot;
                                    </CommandItem>
                                </CommandGroup>
                            )}
                            {person && (
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => {
                                            onPersonChange?.(null);
                                            setIsOpen(false);
                                        }}
                                        className="text-destructive"
                                    >
                                        <X className="mr-2 h-4 w-4" />
                                        Remove person
                                    </CommandItem>
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        );
    }

    return badge;
}

export { PersonBadge };