"use client"
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectCards } from "@/components/meetings/subject-cards";
import { sortSubjectsByImportance } from "@/lib/utils";

export default function SubjectsPage() {
    const { meeting, subjects } = useCouncilMeetingData();
    const sortedSubjects = sortSubjectsByImportance(subjects);
    return <SubjectCards subjects={sortedSubjects} fullWidth />
}