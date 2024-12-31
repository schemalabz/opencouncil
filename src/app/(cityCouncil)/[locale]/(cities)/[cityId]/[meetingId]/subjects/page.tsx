"use client"
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectCards } from "@/components/meetings/subject-cards";

export default function SubjectsPage() {
    const { meeting, subjects } = useCouncilMeetingData();
    return <SubjectCards subjects={subjects} fullWidth />
}