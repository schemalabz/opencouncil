"use client";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import Subject from "@/components/meetings/subject/subject";
import { notFound } from "next/navigation";

export default function SubjectPage({ params }: { params: { cityId: string, meetingId: string, subjectId: string } }) {
    const { city, meeting, subjects } = useCouncilMeetingData();
    const subject = subjects.find(s => s.id === params.subjectId);

    if (!subject) {
        notFound();
    }

    return <Subject subject={subject} />
}