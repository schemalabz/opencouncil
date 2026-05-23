"use client";
import CurrentTimeButton from "@/components/meetings/current-time-button";
import Transcript from "@/components/meetings/transcript/Transcript";
import FisheyeToggle from "@/components/meetings/transcript/FisheyeToggle";

export default function TranscriptPage() {
    return <>
        <Transcript />
        <CurrentTimeButton />
        <FisheyeToggle />
    </>
}
