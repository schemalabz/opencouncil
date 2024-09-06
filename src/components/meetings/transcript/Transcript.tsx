import { SpeakerTag, Utterance, Word } from "@prisma/client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useState } from 'react';
import { useVideo } from "../VideoProvider";

export default function Transcript({ utterances }: { utterances: (Utterance & { words: Word[], speakerTag: SpeakerTag })[] }) {
    const { setCurrentScrollInterval } = useVideo();
    const [visibleUtterances, setVisibleUtterances] = useState<Set<string>>(new Set());
    const transcriptRef = useRef<HTMLDivElement>(null);

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

    const speakerSegments: Array<{ speakerTag: SpeakerTag, utterances: (Utterance & { words: Word[] })[] }>
        = [];
    utterances.forEach((u) => {
        if (speakerSegments.length === 0 || speakerSegments[speakerSegments.length - 1].speakerTag.id !== u.speakerTagId) {
            speakerSegments.push({ speakerTag: u.speakerTag, utterances: [u] });
        } else {
            speakerSegments[speakerSegments.length - 1].utterances.push(u);
        }
    });

    return (
        <div ref={transcriptRef} className="container">
            {speakerSegments.map(({ speakerTag, utterances }, index) =>
                <div key={index}>
                    <SpeakerSegment utterances={utterances} speakerTag={speakerTag} />
                </div>
            )}
        </div>
    );
}