import React, { useRef, useEffect, useMemo } from 'react';
import { SpeakerTag, Utterance, Word, Party, Person } from "@prisma/client";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { useInView } from 'framer-motion';
import { useVideo } from '../VideoProvider';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import TopicBadge from './Topic';
import { PersonBadge } from '@/components/persons/PersonBadge';
import UtteranceC from "./Utterance";
import { useTranscriptOptions } from "../options/OptionsContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const AddSegmentButton = ({ segmentId }: { segmentId: string }) => {
    const { createEmptySegmentAfter } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();

    if (!options.editable) return null;

    return (
        <div className="w-full h-2 group relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 bg-white hover:bg-gray-100"
                            onClick={() => createEmptySegmentAfter(segmentId)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add new segment
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Add a new empty segment here</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};

const SpeakerSegment = React.memo(({ segment, renderMock }: { segment: TranscriptType[number], renderMock: boolean }) => {
    const { getPerson, getParty, getSpeakerTag, people, updateSpeakerTagPerson, updateSpeakerTagLabel } = useCouncilMeetingData();
    const { currentTime } = useVideo();
    const { options } = useTranscriptOptions();

    const memoizedData = useMemo(() => {
        const speakerTag = getSpeakerTag(segment.speakerTagId);
        const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
        const party = person?.partyId ? getParty(person.partyId) : undefined;
        const borderColor = party?.colorHex || '#D3D3D3';
        return { speakerTag, person, party, borderColor };
    }, [segment.speakerTagId, getPerson, getParty, getSpeakerTag]);

    const utterances = segment.utterances;
    if (!utterances) {
        return null;
    }

    const summary = segment.summary;

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = timestamp % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
    };

    const handlePersonChange = (personId: string | null) => {
        if (memoizedData.speakerTag) {
            updateSpeakerTagPerson(memoizedData.speakerTag.id, personId);
        }
    };

    const handleLabelChange = (label: string) => {
        if (memoizedData.speakerTag) {
            updateSpeakerTagLabel(memoizedData.speakerTag.id, label);
        }
    };

    return (
        <>
            <div className='my-4 flex flex-col items-start w-full' style={{ borderLeft: `4px solid ${memoizedData.borderColor}` }}>
                <div className='w-full'>
                    <div className='sticky top-[80px] flex flex-row items-center justify-between w-full border-b border-gray-300 bg-white z-30'>
                        {renderMock ? <div className='w-full h-full bg-gray-100' /> : (
                            <div className='flex flex-col w-full mb-4'>
                                <div className='flex flex-row justify-around w-full items-center'>
                                    <div className='flex-grow overflow-hidden ml-2'>
                                        {memoizedData.speakerTag && (
                                            <PersonBadge
                                                person={memoizedData.person ? { ...memoizedData.person, party: memoizedData.party || null } : undefined}
                                                speakerTag={memoizedData.speakerTag}
                                                editable={options.editable}
                                                onPersonChange={handlePersonChange}
                                                onLabelChange={handleLabelChange}
                                                availablePeople={people.map(p => ({
                                                    ...p,
                                                    party: p.partyId ? getParty(p.partyId) || null : null
                                                }))}
                                            />
                                        )}
                                    </div>
                                    <div className='flex-shrink-0 border-l-2 border-gray-300 pl-2 ml-4 text-xs'>
                                        {formatTimestamp(segment.startTimestamp)}
                                    </div>
                                </div>
                                {summary ?
                                    <div className='ml-4 text-sm font-semibold'>
                                        {summary.text}
                                        {segment.topicLabels.map(tl => <TopicBadge topic={tl.topic} key={tl.topic.id} />)}
                                    </div>
                                    : null}
                            </div>
                        )}
                    </div>
                    <div className='font-mono pl-4 text-justify w-full overflow-x-hidden'>
                        {renderMock ? <div className='w-full break-words whitespace-pre-wrap'>
                            {utterances.map((u, i) => <span className='break-words' id={u.id} key={u.id}>{u.text} </span>)}
                        </div> : (
                            <>
                                {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
                            </>
                        )}
                    </div>
                </div>
            </div>
            {!renderMock && <AddSegmentButton segmentId={segment.id} />}
        </>
    );
});

SpeakerSegment.displayName = 'SpeakerSegment';

export default SpeakerSegment;
