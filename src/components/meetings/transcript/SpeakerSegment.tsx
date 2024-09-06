import UtteranceC from "./Utterance";
import { SpeakerTag, Utterance, Word } from "@prisma/client";

export default function SpeakerSegment({ utterances, speakerTag }: { utterances: (Utterance & { words: Word[] })[], speakerTag: SpeakerTag }) {

    return (
        <div className='my-4'>
            <div className='font-bold bg-white'>{speakerTag.label}</div>
            <div className='font-mono'>
                {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
            </div>
        </div>
    )
}

