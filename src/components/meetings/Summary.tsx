import SpeakerTagC from "../SpeakerTag";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext"
import TopicBadge from "./transcript/Topic";
import { useVideo } from "./VideoProvider";
import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { CommandList } from "cmdk";

export default function Summary() {
    const { transcript, getPerson, getParty, parties, speakerTags } = useCouncilMeetingData();
    const { seekTo } = useVideo();
    const [selectedParty, setSelectedParty] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const topics = useMemo(() => {
        return Array.from(new Set(transcript.flatMap(segment => segment.topicLabels.map(tl => tl.topic.name))));
    }, [transcript]);

    const partyOptions = useMemo(() => {
        return parties ? parties.map(party => party.name) : [];
    }, [parties]);

    const filteredTranscript = transcript.filter(segment => {
        const person = segment.speakerTag.personId ? getPerson(segment.speakerTag.personId) : null;
        const party = person && person.partyId ? getParty(person.partyId) : null;
        const segmentTopics = segment.topicLabels.map(tl => tl.topic.name);

        return (!selectedParty || (party && party.name === selectedParty)) &&
            (!selectedTopic || segmentTopics.includes(selectedTopic));
    });

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Toποθετήσεις</h2>
            <div className="flex space-x-4 mb-4">
                <Combobox
                    options={partyOptions}
                    value={selectedParty}
                    onChange={setSelectedParty}
                    placeholder="Φίλτρο παράταξης"
                    className="w-1/2"
                />
                <Combobox
                    options={topics}
                    value={selectedTopic}
                    onChange={setSelectedTopic}
                    placeholder="Φίλτρο θέματος"
                    className="w-1/2"
                />
            </div>
            <div>
                {filteredTranscript.map((segment) => {
                    if (!segment.summary) return null;
                    const person = segment.speakerTag.personId ? getPerson(segment.speakerTag.personId) : null;
                    const party = person && person.partyId ? getParty(person.partyId) : null;
                    const color = party ? party.colorHex : 'gray';
                    const startTime = segment.startTimestamp;
                    const durationInMinutes = Math.round((segment.endTimestamp - startTime) / 60);
                    return (
                        <div
                            key={segment.id}
                            className="flex flex-col mb-8  border-l-4 pl-2 cursor-pointer hover:bg-accent p-1" style={{ borderColor: color }}
                            onClick={() => seekTo(startTime)}
                        >
                            <div className='flex flex-row justify-between text-sm'>
                                <span>{durationInMinutes} λεπτά</span>
                                <span>{formatTimestamp(startTime)}</span>
                            </div>
                            <div className="flex flex-row">
                                <div className="w-1/3 flex-shrink-0 overflow-hidden">
                                    <SpeakerTagC speakerTag={segment.speakerTag} />
                                </div>
                                <div className="w-2/3 flex-grow">
                                    <div className="text-sm text-muted-foreground text-justify">{segment.summary.text}</div>
                                </div>
                            </div>
                            <div className="">
                                {segment.topicLabels.map((tl) => <TopicBadge key={tl.id} topic={tl.topic} />)}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function Combobox({ options, value, onChange, placeholder, className }: {
    options: string[],
    value: string | null,
    onChange: (value: string | null) => void,
    placeholder: string,
    className?: string
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[200px] justify-between text-ellipsis text-xs overflow-hidden"
                >
                    {value ?? placeholder}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("p-0", className)}>
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandEmpty>No result found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option}
                                    onSelect={() => {
                                        onChange(option === value ? null : option)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {option}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}