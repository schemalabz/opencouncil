import React, { useRef, useEffect } from 'react';
import SpeakerTagC from "@/components/SpeakerTag";
import UtteranceC from "./Utterance";
import { SpeakerTag, Utterance, Word, Party, Person } from "@prisma/client";
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";

const SpeakerSegment = React.memo(({ utterances, speakerTagId }: { utterances: (Utterance & { words: Word[] })[], speakerTagId: SpeakerTag["id"] }) => {
    const { getPerson, getParty, getSpeakerTag } = useCouncilMeetingData();

    const speakerTag = React.useMemo(() => getSpeakerTag(speakerTagId), [getSpeakerTag, speakerTagId]);
    const person = React.useMemo(() => speakerTag?.personId ? getPerson(speakerTag.personId) : undefined, [getPerson, speakerTag]);
    const party = React.useMemo(() => person?.partyId ? getParty(person.partyId) : undefined, [getParty, person]);

    const borderColor = party?.colorHex || '#D3D3D3';

    return (
        <div className='my-4'>
            <div style={{ borderLeft: `4px solid ${borderColor}` }} className='relative'>
                <div className='sticky top-0 bg-transcript'>
                    <SpeakerTagC speakerTag={speakerTag!} className='ml-4' />
                </div>
                <div className='font-mono ml-4'>
                    {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
                </div>
            </div>
        </div>
    );
});

SpeakerSegment.displayName = 'SpeakerSegment';

export default SpeakerSegment;
