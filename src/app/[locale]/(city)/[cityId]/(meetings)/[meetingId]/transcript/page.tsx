"use client";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import CurrentTimeButton from "@/components/meetings/current-time-button";
import Transcript from "@/components/meetings/transcript/Transcript";
import TranscriptControls from "@/components/meetings/TranscriptControls";
import { useEffect, useState } from "react";

export default function TranscriptPage() {
    return <>
        <Transcript />
        <CurrentTimeButton />
    </>
}
