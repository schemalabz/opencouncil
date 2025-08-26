"use client";
import { useParams } from "next/navigation";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { HighlightView } from "@/components/meetings/HighlightView";
import { notFound } from "next/navigation";

export default function HighlightPage() {
    const params = useParams();
    const { meeting, highlights } = useCouncilMeetingData();
    const highlightId = params.highlightId as string;
    
    // Find the highlight from existing data
    const highlight = highlights.find(h => h.id === highlightId);
    
    // Validate that the highlight exists and belongs to this meeting
    if (!highlight || highlight.meetingId !== meeting.id) {
        notFound();
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <HighlightView highlight={highlight} />
        </div>
    );
} 