"use client";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import Transcript from "@/components/meetings/transcript/Transcript";
import TranscriptControls from "@/components/meetings/TranscriptControls";
import { useEffect, useState } from "react";

export default function TranscriptPage() {
    const { transcript: speakerSegments } = useCouncilMeetingData();
    const [isWide, setIsWide] = useState(false);


    useEffect(() => {
        const checkSize = () => {
            setIsWide(window.innerWidth > window.innerHeight)
        }

        checkSize()
        window.addEventListener('resize', checkSize)

        return () => window.removeEventListener('resize', checkSize)
    }, [])

    return <>
        {speakerSegments.length}
        <Transcript />
        <TranscriptControls isWide={isWide} />
    </>
}
