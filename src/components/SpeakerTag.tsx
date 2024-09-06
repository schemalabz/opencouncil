import React, { useMemo, useState } from 'react';
import { Party, Person, SpeakerTag } from "@prisma/client";
import { useTranscriptOptions } from "./meetings/options/OptionsContext";
import { ImageOrInitials } from "./ImageOrInitials";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

function SpeakerTagC({ speakerTag, className }: {
    speakerTag: SpeakerTag,
    className?: string,
}) {
    const { options, updateOptions } = useTranscriptOptions();
    const { getPerson, getParty, people, updateSpeakerTagPerson } = useCouncilMeetingData();
    const editable = options.editable;
    const [open, setOpen] = useState(false);

    const { person, party, isTagged, name, partyColor } = useMemo(() => {
        let person: Person | undefined = undefined;
        let party: Party | undefined = undefined;
        let isTagged = speakerTag.personId !== null;
        if (speakerTag.personId) {
            person = getPerson(speakerTag.personId);
            party = person?.partyId ? getParty(person.partyId) : undefined;
            isTagged = true;
        }
        const name = isTagged ? person?.name_short : speakerTag.label;
        const partyColor = party?.colorHex;
        return { person, party, isTagged, name, partyColor };
    }, [speakerTag, getPerson, getParty]);

    const handleSpeakerChange = (personId: string | null) => {
        updateSpeakerTagPerson(speakerTag.id, personId);
        console.log(`Assigning speaker tag to person with id: ${personId}`);
    };

    const handleTagClick = () => {
        if (editable) {
            if (speakerTag.personId) {
                handleSpeakerChange(null);
            } else {
                setOpen(true);
            }
        }

        if (options.selectedSpeakerTag === speakerTag.id) {
            updateOptions({ selectedSpeakerTag: null });
        } else {
            updateOptions({ selectedSpeakerTag: speakerTag.id });
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    className={
                        cn(`inline-flex items-center py-1 pr-1 cursor-pointer
                            transition-all duration-200 hover:bg-gray-100
                            ${options.selectedSpeakerTag === speakerTag.id ? 'bg-gray-100' : ''}`
                            , className)}
                    onClick={handleTagClick}
                >
                    <ImageOrInitials
                        imageUrl={isTagged && person?.image ? person.image : null}
                        width={24}
                        height={24}
                        name={isTagged ? (name ?? '') : undefined}
                    />
                    <span className="ml-2 font-semibold text-sm whitespace-nowrap">{name}</span>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-96">
                {!editable ? (
                    <div>{party?.name || 'No party assigned'}</div>
                ) : (
                    <Command>
                        <CommandInput placeholder="Search speaker..." />
                        <CommandList>
                            <CommandEmpty>No speaker found.</CommandEmpty>
                            <CommandGroup>
                                {people.map((person) => (
                                    <CommandItem
                                        key={person.id}
                                        value={`${person.name} ${person.name_en} ${person.name_short} ${person.name_short_en}`}
                                        onSelect={() => {
                                            handleSpeakerChange(person.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <div className="flex items-center">
                                            <div className="mr-2" style={{ borderLeft: person.partyId ? `4px solid ${getParty(person.partyId)?.colorHex || 'transparent'}` : 'none', paddingLeft: '4px' }}>
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
                                                speakerTag.personId === person.id ? "opacity-100" : "opacity-0"
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

export default SpeakerTagC;
