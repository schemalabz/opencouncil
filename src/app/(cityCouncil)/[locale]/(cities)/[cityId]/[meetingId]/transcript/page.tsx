"use client";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import Transcript from "@/components/meetings/transcript/Transcript";
import TranscriptControls from "@/components/meetings/TranscriptControls";
import { useEffect, useState } from "react";

export default function TranscriptPage() {
    const { transcript: speakerSegments } = useCouncilMeetingData();

    return <>
        {speakerSegments.length}
        <Transcript />
    </>
}
