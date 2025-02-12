"use client";
import Highlights from "@/components/Highlights";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";

export default function HighlightsPage() {
    const { highlights } = useCouncilMeetingData();
    return (
        <div className="container mx-auto py-8 px-4">
            <Highlights highlights={highlights} />
        </div>
    );
}
