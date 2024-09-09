import React, { useRef, useEffect } from 'react';
import SpeakerTagC from "@/components/SpeakerTag";
import UtteranceC from "./Utterance";
import { SpeakerTag, Utterance, Word, Party, Person } from "@prisma/client";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { useInView } from 'framer-motion';
import { useVideo } from '../VideoProvider';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import TopicBadge from './Topic';

const SpeakerSegment = React.memo(({ segment, renderMock }: { segment: TranscriptType[number], renderMock: boolean }) => {
    const { getPerson, getParty, getSpeakerTag } = useCouncilMeetingData();
    const { currentTime } = useVideo();
    const utterances = segment.utterances;
    const speakerTagId = segment.speakerTagId;
    const summary = segment.summary;
    const topics = segment.topicLabels.map(tl => tl.topic);
    const isActive = currentTime >= utterances[0].startTimestamp && currentTime <= utterances[utterances.length - 1].endTimestamp;

    const speakerTag = React.useMemo(() => getSpeakerTag(speakerTagId), [getSpeakerTag, speakerTagId]);
    const person = React.useMemo(() => speakerTag?.personId ? getPerson(speakerTag.personId) : undefined, [getPerson, speakerTag]);
    const party = React.useMemo(() => person?.partyId ? getParty(person.partyId) : undefined, [getParty, person]);

    const borderColor = party?.colorHex || '#D3D3D3';

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = timestamp % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
    };

    return (
        <div className='my-4 flex flex-col items-start w-full' style={{ borderLeft: `4px solid ${borderColor}` }}>
            <div className='w-full'>
                <div className='sticky top-0 bg-transcript flex flex-row items-center justify-between w-full'>
                    {renderMock ? <div className='w-full h-full bg-gray-100' /> : (
                        <div className='flex flex-col w-full mb-4'>
                            <div className='flex flex-row justify-around w-full items-center'>
                                <div className='flex-grow overflow-hidden'>
                                    <SpeakerTagC speakerTag={speakerTag!} className='ml-4' />
                                </div>
                                <div className='flex-shrink-0 border-l-2 border-gray-300 pl-2 ml-4 text-xs'>
                                    {formatTimestamp(utterances[0].startTimestamp)}
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
                <div className='font-mono ml-4 text-justify w-full overflow-x-hidden'>
                    {renderMock ? <div className='w-full h-full bg-none'>
                        {utterances.map((u, i) => <span className='bg-none' id={u.id} key={u.id}>{u.text}</span>)}
                    </div> : (
                        <>
                            {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

SpeakerSegment.displayName = 'SpeakerSegment';

export default SpeakerSegment;
