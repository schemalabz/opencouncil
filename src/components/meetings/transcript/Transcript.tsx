import { SpeakerTag, Utterance, Word } from "@prisma/client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useState } from 'react';
import { useVideo } from "../VideoProvider";

export default function Transcript({ utterances, speakerSegments }: { utterances: (Utterance & { words: Word[] })[], speakerSegments: Array<{ speakerTagId: SpeakerTag["id"], utterances: (Utterance & { words: Word[] })[] }> }) {
    const { setCurrentScrollInterval } = useVideo();
    const [visibleUtterances, setVisibleUtterances] = useState<Set<string>>(new Set());
    const transcriptRef = useRef<HTMLDivElement>(null);

    useEffect(() => {

        const observer = new IntersectionObserver((entries) => {
            setVisibleUtterances(prevVisible => {
                const newVisible = new Set(prevVisible);
                entries.forEach(entry => {
                    const utteranceId = entry.target.id;
                    if (entry.isIntersecting) {
                        newVisible.add(utteranceId);
                    } else {
                        newVisible.delete(utteranceId);
                    }
                });
                return newVisible;
            });
        }, {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        });

        const utteranceElements = document.querySelectorAll('.utterance');
        utteranceElements.forEach(el => observer.observe(el));

        return () => {
            utteranceElements.forEach(el => observer.unobserve(el));
        };
    }, [utterances, setCurrentScrollInterval]);

    useEffect(() => {
        const updateScrollInterval = () => {
            if (visibleUtterances.size > 0) {
                const visibleUtterancesList = utterances.filter(u => visibleUtterances.has(u.id));
                if (visibleUtterancesList.length > 0) {
                    const firstVisibleUtterance = visibleUtterancesList[0];
                    const lastVisibleUtterance = visibleUtterancesList[visibleUtterancesList.length - 1];

                    setCurrentScrollInterval([
                        firstVisibleUtterance.words[0].startTimestamp,
                        lastVisibleUtterance.words[lastVisibleUtterance.words.length - 1].endTimestamp
                    ]);
                }
            }
        };

        updateScrollInterval();
    }, [visibleUtterances, utterances, setCurrentScrollInterval]);

    if (utterances.length === 0) {
        return <div className='flex justify-center items-center h-full w-full my-12'>
            <div className='text-muted-foreground'>No transcript available</div>
        </div>
    }

    return (
        <div ref={transcriptRef} className="container" >
            {speakerSegments.map(({ speakerTagId, utterances }, index) =>
                <div key={index}>
                    <SpeakerSegment utterances={utterances} speakerTagId={speakerTagId} />
                </div>
            )}
        </div>
    );
}