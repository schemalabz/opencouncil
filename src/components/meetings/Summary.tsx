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
import Combobox from "../Combobox";
import { PersonBadge } from "../persons/PersonBadge";

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
                            className="flex flex-col mb-8 border-l-4 pl-2 cursor-pointer hover:bg-accent p-1" style={{ borderColor: color }}
                            onClick={() => seekTo(startTime)}
                        >
                            <div className='flex flex-row justify-between text-sm'>
                                <span>{durationInMinutes} λεπτά</span>
                                <span>{formatTimestamp(startTime)}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row">
                                <div className="w-full sm:w-1/3 flex-shrink-0 overflow-hidden mb-2 sm:mb-0">
                                    <div className="flex items-center space-x-2">
                                        <PersonBadge
                                            person={person ? { ...person, party: party || null } : undefined}
                                            speakerTag={segment.speakerTag}
                                        />
                                        <p className="text-sm">{segment.summary.text}</p>
                                    </div>
                                </div>
                                <div className="w-full sm:w-2/3 flex-grow">
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
