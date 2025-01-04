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
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface PersonBadgeProps {
    // Core data
    person?: Person & { party: Party | null };
    speakerTag?: SpeakerTag;

    // Display options
    short?: boolean; // If true, only shows avatar
    className?: string;
    withBorder?: boolean;
    isSelected?: boolean;

    // For speaker tags
    editable?: boolean;
    onPersonChange?: (personId: string | null) => void;
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
    availablePeople,
}: PersonBadgeProps) {
    const router = useRouter();
    const partyColor = person?.party?.colorHex || 'gray';
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
                <div className="flex-col">
                    <div className="ml-2 font-semibold text-md whitespace-nowrap">
                        {person?.name_short || speakerTag?.label || ''}
                    </div>
                    {person?.role && (
                        <div className="ml-2 text-muted-foreground text-sm">
                            <div className="whitespace-nowrap text-ellipsis">{person.role}</div>
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
                    <ImageOrInitials
                        imageUrl={person?.image || null}
                        width={48}
                        height={48}
                        name={person?.name_short || speakerTag?.label || ''}
                        color={partyColor}
                    />
                    <div>
                        <div className="font-semibold">{person?.name_short || speakerTag?.label || ''}</div>
                        {person?.role && <div className="text-sm text-muted-foreground">{person.role}</div>}
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
                <Command>
                    <CommandInput placeholder="Search speaker..." />
                    <CommandList>
                        <CommandEmpty>No speaker found.</CommandEmpty>
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
            </PopoverContent>
        </Popover>
    );
}