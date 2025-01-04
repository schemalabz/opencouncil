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

interface UserBadgeProps {
    // Core data
    imageUrl: string | null;
    name: string;
    role?: string | null;
    party?: Party | null;
    cityId?: string;
    userId?: string;

    // Display options
    short?: boolean; // If true, only shows avatar
    className?: string;
    withBorder?: boolean;
    isSelected?: boolean;

    // For speaker tags
    speakerTag?: SpeakerTag;
    editable?: boolean;
    onPersonChange?: (personId: string | null) => void;
    availablePeople?: Person[];
}

export function UserBadge({
    imageUrl,
    name,
    role,
    party,
    cityId,
    userId,
    short = false,
    className,
    isSelected = false,
    speakerTag,
    editable = false,
    onPersonChange,
    availablePeople,
}: UserBadgeProps) {
    const router = useRouter();
    const partyColor = party?.colorHex || 'gray';

    const badge = (
        <div
            className={cn(
                "inline-flex items-center py-1 pr-1 cursor-pointer transition-transform duration-200 hover:scale-105",
                isSelected && "bg-gray-100",
                className
            )}
        >
            <ImageOrInitials
                imageUrl={imageUrl}
                width={40}
                height={40}
                name={name}
                color={partyColor}
            />
            {!short && (
                <div className="flex-col">
                    <div className="ml-2 font-semibold text-md whitespace-nowrap">{name}</div>
                    {role && (
                        <div className="ml-2 text-muted-foreground text-sm">
                            <div className="whitespace-nowrap text-ellipsis">{role}</div>
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
                        imageUrl={imageUrl}
                        width={48}
                        height={48}
                        name={name}
                        color={partyColor}
                    />
                    <div>
                        <div className="font-semibold">{name}</div>
                        {role && <div className="text-sm text-muted-foreground">{role}</div>}
                    </div>
                </div>
                {party && (
                    <Badge
                        style={{ backgroundColor: party.colorHex }}
                        className="text-foreground w-fit hover:bg-background/80"
                    >
                        {party.name}
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
                        cityId && userId && "cursor-pointer"
                    )}
                    onClick={() => {
                        if (cityId && userId) {
                            router.push(`/${cityId}/people/${userId}`);
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
                            {availablePeople?.map((person) => (
                                <CommandItem
                                    key={person.id}
                                    value={`${person.name} ${person.name_short}`}
                                    onSelect={() => onPersonChange?.(person.id)}
                                >
                                    <div className="flex items-center">
                                        <div
                                            className="mr-2"
                                            style={{
                                                borderLeft: person.partyId ?
                                                    `4px solid ${party?.colorHex || 'transparent'}` :
                                                    'none',
                                                paddingLeft: '4px'
                                            }}
                                        >
                                            <ImageOrInitials
                                                imageUrl={person.image || null}
                                                width={32}
                                                height={32}
                                                name={person.name_short}
                                            />
                                        </div>
                                        <span className="text-base">{person.name_short}</span>
                                    </div>
                                    <Check
                                        className={cn(
                                            "ml-auto h-4 w-4",
                                            speakerTag?.personId === person.id ? "opacity-100" : "opacity-0"
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