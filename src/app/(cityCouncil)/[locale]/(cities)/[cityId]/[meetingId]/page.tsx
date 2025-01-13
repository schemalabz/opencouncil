"use client"
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectCards } from "@/components/meetings/subject-cards";
import { formatDate } from "date-fns";
import { CalendarIcon, FileIcon, VideoIcon } from "lucide-react";
import { sortSubjectsByImportance } from "@/lib/utils";
export default function MeetingPage() {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const hottestSubjects = sortSubjectsByImportance(subjects)
        .slice(0, Math.max(5, subjects.filter(s => s.hot).length));

    return (
        <div className="flex flex-col w-full">
            <div className="relative h-[300px] w-full">
                <Map className="w-full h-full" features={[{
                    id: city.id,
                    geometry: city.geometry,
                    properties: {
                        name: city.name,
                        name_en: city.name_en
                    },
                    style: {
                        fillColor: '#627BBC',
                        fillOpacity: 0.2,
                        strokeColor: '#627BBC',
                        strokeWidth: 2,
                    }
                }]}
                />
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-white via-white/70 to-transparent" />
                <MeetingInfo />
            </div>
            <SubjectCards subjects={hottestSubjects} totalSubjects={subjects.length} />
        </div>
    )
}


function MeetingInfo() {
    const { meeting, subjects } = useCouncilMeetingData();
    return (
        <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold mb-2">{meeting.name}</h1>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {formatDate(new Date(meeting.dateTime), 'PPP')}
                    </div>
                    {meeting.videoUrl && (
                        <div className="flex items-center">
                            <VideoIcon className="w-4 h-4 mr-2" />
                            {meeting.videoUrl ? "Βίντεο Διαθέσιμο" : meeting.audioUrl ? "Μόνο ήχος" : "Χωρίς βίντεο/ήχο"}
                        </div>
                    )}
                    {subjects.length > 0 ? (
                        <div className="flex items-center">
                            <FileIcon className="w-4 h-4 mr-2" />
                            {subjects.length} θέματα
                        </div>
                    ) : (
                        <div className="flex items-center">
                            <FileIcon className="w-4 h-4 mr-2" />

                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}