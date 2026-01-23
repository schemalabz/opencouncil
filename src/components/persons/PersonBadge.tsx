import { useState, useRef, useEffect } from 'react';
import { SpeakerTag } from "@prisma/client";
import { ImageOrInitials } from "../ImageOrInitials";
import { cn, filterActiveRoles, getPartyFromRoles } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, X, Edit2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { PersonWithRelations } from '@/lib/db/people';
import { RoleDisplay } from './RoleDisplay';

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
    const activeRoles = person ? filterActiveRoles(person.roles) : [];
    const party = person ? getPartyFromRoles(person.roles) : null;
    const partyColor = party?.colorHex || 'gray';

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
                        party && `bg-[${partyColor}]`
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
                    <div className={cn("font-medium text-foreground truncate sm:break-words", nameTextSize, size === 'sm' && "text-sm sm:text-base")}>
                        {person ? (
                            preferFullName ? person.name : switchOrder(person.name)
                        ) : (
                            speakerTag?.label
                        )}
                        {editable && segmentCount !== undefined && (
                            <span className="hidden sm:inline ml-2 text-muted-foreground font-normal">
                                ({segmentCount} {segmentCount === 1 ? 'segment' : 'segments'})
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

interface PersonBadgeProps extends PersonDisplayProps {
    withBorder?: boolean;
    isSelected?: boolean;
    onPersonChange?: (personId: string | null) => void;
    onLabelChange?: (label: string) => void;
    availablePeople?: PersonWithRelations[];
    nextUnknownLabel?: string;
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
    nextUnknownLabel,
    preferFullName = false,
    size = 'md',
}: PersonBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editMode, setEditMode] = useState(false);
    const router = useRouter();
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = 0;
        }
    }, [searchQuery, isOpen]);

    const handleSetLabel = (label: string) => {
        onPersonChange?.(null);
        onLabelChange?.(label);
        setIsOpen(false);
    };

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
                "relative flex items-center gap-2 rounded-lg p-1.5 sm:p-2 min-w-0",
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
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    {badge}
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                    <Command>
                        <CommandInput
                            autoFocus
                            placeholder="Search people..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                        />
                        <CommandList ref={listRef}>
                            <CommandEmpty>No results found</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => handleSetLabel(nextUnknownLabel || "Άγνωστος Ομιλητής")}
                                    className="flex items-center gap-2"
                                >
                                    <div className="w-10 h-10 relative shrink-0 flex items-center justify-center bg-muted rounded-full">
                                        <span className="text-xs font-medium">?</span>
                                    </div>
                                    <span className="font-medium">{nextUnknownLabel || "Άγνωστος Ομιλητής"}</span>
                                </CommandItem>
                            </CommandGroup>
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
                                        onSelect={() => handleSetLabel(searchQuery)}
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