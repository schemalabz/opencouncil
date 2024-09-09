import React, { useMemo, useState } from 'react';
import { Party, Person, SpeakerTag } from "@prisma/client";
import { useTranscriptOptions } from "./meetings/options/OptionsContext";
import { ImageOrInitials } from "./ImageOrInitials";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";

function SpeakerTagC({ speakerTag, className }: {
    speakerTag: SpeakerTag,
    className?: string,
}) {
    const { options, updateOptions } = useTranscriptOptions();
    const { getPerson, getParty, people, updateSpeakerTagPerson, updateSpeakerTagLabel } = useCouncilMeetingData();
    const editable = options.editable;
    const [open, setOpen] = useState(false);
    const [labelInput, setLabelInput] = useState(speakerTag.label || '');

    const { person, party, role, isTagged, name, partyColor } = useMemo(() => {
        let person: Person | null = null;
        let party: Party | null = null;
        let isTagged = speakerTag.personId !== null;
        if (speakerTag.personId) {
            person = getPerson(speakerTag.personId) || null;
            party = person && person.partyId && getParty(person.partyId) ? getParty(person.partyId)! : null;
            isTagged = true;
        }
        const name = isTagged ? person?.name_short : speakerTag.label;
        const partyColor = party?.colorHex;
        const role = isTagged ? person?.role : null;
        return { person, party, role, isTagged, name, partyColor };
    }, [speakerTag, getPerson, getParty]);

    const handleSpeakerChange = (personId: string | null) => {
        updateSpeakerTagPerson(speakerTag.id, personId);
        updateOptions({ selectedSpeakerTag: null });
        console.log(`Assigning speaker tag to person with id: ${personId}`);
    };

    const handleTagClick = () => {
        setOpen(true);

        if (options.selectedSpeakerTag === speakerTag.id) {
            updateOptions({ selectedSpeakerTag: null });
        } else {
            updateOptions({ selectedSpeakerTag: speakerTag.id });
        }
    };

    const handleLabelChange = () => {
        if (labelInput !== speakerTag.label) {
            updateSpeakerTagLabel(speakerTag.id, labelInput);
            console.log(`Updating speaker tag label to: ${labelInput}`);
        }
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={(v) => {
            setOpen(v);
            updateOptions({ selectedSpeakerTag: v ? speakerTag.id : null });
        }}>
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
                        width={40}
                        height={40}
                        name={isTagged ? (name ?? '') : undefined}
                    />
                    <div className='flex-col'>
                        <div className="ml-2 font-semibold text-md whitespace-nowrap">{name}</div>
                        <div className="ml-2 text-muted-foreground text-sm whitespace-nowrap">{role}</div>
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-96">
                {!editable ? (
                    <div>{party?.name || 'No party assigned'}</div>
                ) : (
                    <>
                        {!isTagged && (
                            <div className="mb-4">
                                <label htmlFor="label-input" className="block text-sm font-medium text-gray-700">
                                    Speaker Label
                                </label>
                                <input
                                    type="text"
                                    id="label-input"
                                    value={labelInput}
                                    onChange={(e) => setLabelInput(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                />
                                <button
                                    onClick={handleLabelChange}
                                    className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                    Update Label
                                </button>
                            </div>
                        )}
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
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}

export default SpeakerTagC;
