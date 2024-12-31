"use client";
import { Options } from "@/components/meetings/options/Options";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";

export default function SettingsPage() {
    const { city, meeting } = useCouncilMeetingData();
    return <Options editable={true} />
}