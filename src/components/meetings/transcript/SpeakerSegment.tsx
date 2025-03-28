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
import { Plus, Trash2, Bot } from "lucide-react";

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
    const { getPerson, getParty, getSpeakerTag, getSpeakerSegmentCount, people, updateSpeakerTagPerson, updateSpeakerTagLabel, deleteEmptySegment } = useCouncilMeetingData();
    const { currentTime } = useVideo();
    const { options } = useTranscriptOptions();

    const memoizedData = useMemo(() => {
        const speakerTag = getSpeakerTag(segment.speakerTagId);
        const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
        const party = person?.partyId ? getParty(person.partyId) : undefined;
        const borderColor = party?.colorHex || '#D3D3D3';
        const segmentCount = speakerTag ? getSpeakerSegmentCount(speakerTag.id) : 0;
        return { speakerTag, person, party, borderColor, segmentCount };
    }, [segment.speakerTagId, getPerson, getParty, getSpeakerTag, getSpeakerSegmentCount]);

    const utterances = segment.utterances;
    if (!utterances) {
        return null;
    }

    const isEmpty = utterances.length === 0;

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
            <div className='my-6 flex flex-col items-start w-full rounded-r-lg hover:bg-accent/5 transition-colors' style={{ borderLeft: `4px solid ${memoizedData.borderColor}` }}>
                <div className='w-full'>
                    <div className='sticky top-0 flex flex-row items-center justify-between w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-30'>
                        {renderMock ? <div className='w-full h-full bg-muted' /> : (
                            <div className='flex flex-col w-full space-y-2 py-2'>
                                <div className='flex items-center justify-between w-full px-4'>
                                    <div className='flex-grow overflow-hidden'>
                                        {memoizedData.speakerTag && (
                                            <PersonBadge
                                                person={memoizedData.person}
                                                speakerTag={memoizedData.speakerTag}
                                                segmentCount={memoizedData.segmentCount}
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
                                    <div className='flex items-center gap-3 ml-4'>
                                        {options.editable && isEmpty && !renderMock && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => deleteEmptySegment(segment.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Delete empty segment</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                            <span className='font-medium'>{formatTimestamp(segment.startTimestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                                {summary && (
                                    <div className='px-4 space-y-2'>
                                        <div className='text-sm'>
                                            {summary.text}
                                        </div>
                                        <div className='flex items-center justify-between'>
                                            {segment.topicLabels.length > 0 && (
                                                <div className='flex flex-wrap gap-2'>
                                                    {segment.topicLabels.map(tl =>
                                                        <TopicBadge topic={tl.topic} key={tl.topic.id} />
                                                    )}
                                                </div>
                                            )}
                                            <div className='flex items-center gap-2 text-xs text-muted-foreground ml-auto'>
                                                {summary?.type === 'procedural' && (
                                                    <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                        Διαδικαστικό
                                                    </span>
                                                )}
                                                <div className='flex items-center gap-1'>
                                                    <Bot className="h-3 w-3" />
                                                    <span>Αυτόματη σύνοψη</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className='font-mono px-4 py-3 text-justify w-full leading-relaxed'>
                        {renderMock ? (
                            <div className='w-full break-words whitespace-pre-wrap'>
                                {utterances.map((u, i) =>
                                    <span className='break-words' id={u.id} key={u.id}>{u.text} </span>
                                )}
                            </div>
                        ) : (
                            <>
                                {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
                            </>
                        )}
                    </div>
                </div>
            </div>
            {!renderMock && options.editable && <AddSegmentButton segmentId={segment.id} />}
        </>
    );
});

SpeakerSegment.displayName = 'SpeakerSegment';

export default SpeakerSegment;
