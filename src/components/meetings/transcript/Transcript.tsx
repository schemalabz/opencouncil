import { SpeakerTag, Utterance, Word } from "@prisma/client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useState } from 'react';
import { useVideo } from "../VideoProvider";
import { Transcript as TranscriptType } from "@/lib/db/transcript"

export default function Transcript({ speakerSegments }: { speakerSegments: TranscriptType }) {
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
    }, [speakerSegments, setCurrentScrollInterval]);

    useEffect(() => {
        const updateScrollInterval = () => {
            if (visibleUtterances.size > 0) {
                const visibleSpeakerSegments = speakerSegments.filter(u => visibleUtterances.has(u.id));
                if (visibleSpeakerSegments.length > 0) {
                    const firstVisibleUtterance = visibleSpeakerSegments[0];
                    const lastVisibleUtterance = visibleSpeakerSegments[visibleSpeakerSegments.length - 1];

                    setCurrentScrollInterval([
                        firstVisibleUtterance.startTimestamp,
                        lastVisibleUtterance.endTimestamp
                    ]);
                }
            }
        };

        updateScrollInterval();
    }, [visibleUtterances, speakerSegments, setCurrentScrollInterval]);

    if (speakerSegments.length === 0) {
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