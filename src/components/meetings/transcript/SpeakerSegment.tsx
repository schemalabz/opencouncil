import React, { useRef, useEffect } from 'react';
import SpeakerTagC from "@/components/SpeakerTag";
import UtteranceC from "./Utterance";
import { SpeakerTag, Utterance, Word, Party, Person } from "@prisma/client";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { useInView } from 'framer-motion';
import { useVideo } from '../VideoProvider';

const SpeakerSegment = React.memo(({ utterances, speakerTagId, renderMock }: { utterances: (Utterance & { words: Word[] })[], speakerTagId: SpeakerTag["id"], renderMock: boolean }) => {
    const { getPerson, getParty, getSpeakerTag } = useCouncilMeetingData();
    const { currentTime } = useVideo();
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
        <div className='my-4 flex flex-row items-start ' style={{ borderLeft: `4px solid ${borderColor}` }} >
            <div className='flex-grow relative'>
                <div className='sticky top-0 bg-transcript flex flex-row items-center'>
                    {renderMock ? <div className='w-full h-full bg-gray-100' /> : (
                        <>
                            <SpeakerTagC speakerTag={speakerTag!} className='ml-4' />
                            <div className='flex items-center border-l-2 border-gray-300 pl-2 ml-4 text-xs h-full'>
                                {formatTimestamp(utterances[0].startTimestamp)}
                            </div>
                        </>
                    )}
                </div>
                <div className='font-mono ml-4 text-justify'>
                    {renderMock ? <div className='w-full h-full bg-none' >
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
