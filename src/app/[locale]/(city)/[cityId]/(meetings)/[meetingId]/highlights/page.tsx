"use client";
import HighlightsList from "@/components/meetings/HighlightsList";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";

export default function HighlightsPage() {
    const { highlights } = useCouncilMeetingData();
    return (
        <div className="container mx-auto py-8 px-4">
            <HighlightsList highlights={highlights} />
        </div>
    );
}
