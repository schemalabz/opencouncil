import { SpeakerTag, Utterance, Word } from "@prisma/client";
import UtteranceC from "./Utterance";
import SpeakerSegment from "./SpeakerSegment";

export default function Transcript({ utterances }: { utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] }) {
    const speakerSegments: Array<{ speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[] })[] }>
        = [];
    utterances.forEach((u) => {
        if (speakerSegments.length === 0 || speakerSegments[speakerSegments.length - 1].speakerTag.id !== u.speakerTagId) {
            speakerSegments.push({ speakerTag: u.speakerTag, utterances: [u] });
        } else {
            speakerSegments[speakerSegments.length - 1].utterances.push(u);
        }
    });


    return <div>
        {speakerSegments.map(({ speakerTag, utterances }) =>
            <div key={speakerTag.id}>
                <SpeakerSegment utterances={utterances} speakerTag={speakerTag} />
            </div>
        )}
    </div>
}