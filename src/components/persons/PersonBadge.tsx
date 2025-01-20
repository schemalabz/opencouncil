import React, { useState } from 'react';
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

interface PersonBadgeProps {
    // Core data
    person?: Person & { party: Party | null };
    speakerTag?: SpeakerTag;

    // Display options
    short?: boolean; // If true, only shows avatar
    className?: string;
    withBorder?: boolean;
    isSelected?: boolean;
    preferFullName?: boolean; // If true, shows full name when space permits

    // For speaker tags
    editable?: boolean;
    onPersonChange?: (personId: string | null) => void;
    onLabelChange?: (label: string) => void;
    availablePeople?: (Person & { party: Party | null })[];
}

export function PersonBadge({
    person,
    speakerTag,
    short = false,
    className,
    isSelected = false,
    editable = false,
    onPersonChange,
    onLabelChange,
    availablePeople,
    preferFullName = false,
}: PersonBadgeProps) {
    const router = useRouter();
    const partyColor = person?.party?.colorHex || 'gray';
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [tempLabel, setTempLabel] = useState(speakerTag?.label || '');

    const handleLabelSubmit = () => {
        if (onLabelChange && tempLabel.trim()) {
            onLabelChange(tempLabel.trim());
        }
        setIsEditingLabel(false);
    };

    const badge = (
        <div
            className={cn(
                "inline-flex items-center py-1 pr-1 cursor-pointer z-10",
                "transform-gpu hover:translate-y-[-2px] transition-transform duration-200", // Fixed scaling with translate
                isSelected && "bg-gray-100",
                className
            )}
        >
            <ImageOrInitials
                imageUrl={person?.image || null}
                width={40}
                height={40}
                name={person?.name_short || speakerTag?.label || ''}
                color={partyColor}
            />
            {!short && (
                <div className="flex-col min-w-0 flex-1 overflow-hidden">
                    <div className="ml-2 font-semibold text-md">
                        <div className="truncate">
                            {preferFullName ? person?.name || person?.name_short : person?.name_short || speakerTag?.label || ''}
                        </div>
                    </div>
                    {person?.role && (
                        <div className="ml-2 text-muted-foreground text-sm overflow-hidden text-ellipsis">
                            {person.role}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    if (!editable) {
        const content = (
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <div className="flex-shrink-0">
                        <ImageOrInitials
                            imageUrl={person?.image || null}
                            width={48}
                            height={48}
                            name={person?.name_short || speakerTag?.label || ''}
                            color={partyColor}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold truncate">{person?.name_short || speakerTag?.label || ''}</div>
                        {person?.role && <div className="text-sm text-muted-foreground truncate">{person.role}</div>}
                    </div>
                </div>
                {person?.party && (
                    <Badge
                        style={{ backgroundColor: person.party.colorHex }}
                        className="text-foreground w-fit hover:bg-background/80"
                    >
                        {person.party.name}
                    </Badge>
                )}
            </div>
        );

        return (
            <Popover>
                <PopoverTrigger asChild>
                    {badge}
                </PopoverTrigger>
                <PopoverContent
                    className={cn(
                        "w-80",
                        person?.cityId && "cursor-pointer"
                    )}
                    onClick={() => {
                        if (person?.cityId && person?.id) {
                            router.push(`/${person.cityId}/people/${person.id}`);
                        }
                    }}
                >
                    {content}
                </PopoverContent>
            </Popover>
        );
    }

    // Editable speaker tag mode
    return (
        <Popover>
            <PopoverTrigger asChild>
                {badge}
            </PopoverTrigger>
            <PopoverContent className="w-96">
                {isEditingLabel ? (
                    <div className="flex flex-col gap-2">
                        <Input
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.target.value)}
                            placeholder="Enter speaker label"
                            className="w-full"
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setIsEditingLabel(false)}>
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleLabelSubmit}>
                                Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Command>
                        <CommandInput placeholder="Search speaker..." />
                        <CommandList>
                            <CommandEmpty>
                                <div className="flex flex-col gap-2 p-2">
                                    <span>No speaker found.</span>
                                    {!person && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setIsEditingLabel(true)}
                                            className="flex items-center gap-2"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                            Edit Label
                                        </Button>
                                    )}
                                </div>
                            </CommandEmpty>
                            <CommandGroup>
                                {speakerTag && (
                                    <CommandItem
                                        onSelect={() => onPersonChange?.(null)}
                                        className="text-red-500 hover:bg-red-100"
                                    >
                                        <X className="mr-2 h-4 w-4" />
                                        <span>Unassign speaker</span>
                                    </CommandItem>
                                )}
                                {availablePeople?.map((availablePerson) => (
                                    <CommandItem
                                        key={availablePerson.id}
                                        value={`${availablePerson.name} ${availablePerson.name_short}`}
                                        onSelect={() => onPersonChange?.(availablePerson.id)}
                                    >
                                        <div className="flex items-center">
                                            <div
                                                className="mr-2"
                                                style={{
                                                    borderLeft: availablePerson.party ?
                                                        `4px solid ${availablePerson.party.colorHex || 'transparent'}` :
                                                        'none',
                                                    paddingLeft: '4px'
                                                }}
                                            >
                                                <ImageOrInitials
                                                    imageUrl={availablePerson.image || null}
                                                    width={32}
                                                    height={32}
                                                    name={availablePerson.name_short}
                                                />
                                            </div>
                                            <span className="text-base">{availablePerson.name_short}</span>
                                        </div>
                                        <Check
                                            className={cn(
                                                "ml-auto h-4 w-4",
                                                speakerTag?.personId === availablePerson.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                )}
            </PopoverContent>
        </Popover>
    );
}