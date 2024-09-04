import UtteranceC from "./Utterance";
import { SpeakerTag, Utterance, Word } from "@prisma/client";

export default function SpeakerSegment({ utterances, speakerTag }: { utterances: (Utterance & { words: Word[] })[], speakerTag: SpeakerTag }) {
    return (
        <div className='relative'>
            <div className='font-bold pr-4 sticky top-[44px] bg-white z-20 p-2'>{speakerTag.label}</div>
            <div className='font-mono mt-2'>
                {utterances.map((u) => <UtteranceC key={u.id} utterance={u} />)}
            </div>
        </div>
    )
}