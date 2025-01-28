"use client"
import Map from "@/components/map/map";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { SubjectCards } from "@/components/meetings/subject-cards";
import { formatDate } from "date-fns";
import { AlertTriangleIcon, CalendarIcon, ExternalLink, FileIcon, FileText, VideoIcon } from "lucide-react";
import { cn, sortSubjectsByImportance, subjectToMapFeature } from "@/lib/utils";
import { Link } from "@/i18n/routing";

export default function MeetingPage() {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const hottestSubjects = sortSubjectsByImportance(subjects)
        .slice(0, Math.max(5, subjects.filter(s => s.hot).length));
    const isOldVersion = subjects.length === 0;

    // Convert all subjects with locations to map features
    const subjectFeatures = subjects
        .map(subjectToMapFeature)
        .filter((f): f is NonNullable<ReturnType<typeof subjectToMapFeature>> => f !== null);

    return (
        <div className="flex flex-col w-full">
            <div className="relative h-[200px] sm:h-[300px] w-full">
                <Map className="w-full h-full" features={[
                    {
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
                    },
                    ...subjectFeatures
                ]}
                />
                <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 bg-gradient-to-t from-white via-white/70 to-transparent" />
                <MeetingInfo />
            </div>

            <div className="p-4 sm:p-6">
                {
                    !meeting.youtubeUrl && meeting.agendaUrl && (
                        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto mb-8 p-4 rounded-lg border bg-muted/50">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangleIcon className="w-5 h-5 text-yellow-500" />
                                <span className="font-medium">Αυτή η συνεδρίαση δεν έχει γίνει ακόμα.</span>
                            </div>
                            <div>
                                Μπορείτε <Link
                                    href={meeting.agendaUrl}
                                    target="_blank"
                                    className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                                >
                                    να διαβάσετε την ημερήσια διάταξη εδώ
                                    <ExternalLink className="w-4 h-4" />
                                </Link>
                            </div>
                        </div>
                    )
                }
                <SubjectCards subjects={hottestSubjects} totalSubjects={subjects.length} />
            </div>
        </div>
    )
}

function MeetingInfo() {
    const { meeting, subjects } = useCouncilMeetingData();
    return (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
                <h1 className="text-xl sm:text-2xl font-bold">{meeting.name}</h1>
                <div className="flex flex-wrap gap-4 sm:gap-6 text-xs sm:text-sm text-gray-600">
                    <div className="flex items-center">
                        <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {formatDate(new Date(meeting.dateTime), 'PPP')}
                    </div>
                    {meeting.videoUrl && (
                        <div className="flex items-center">
                            <VideoIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                            {meeting.videoUrl ? "Βίντεο Διαθέσιμο" : meeting.audioUrl ? "Μόνο ήχος" : "Χωρίς βίντεο/ήχο"}
                        </div>
                    )}

                    {meeting.agendaUrl && (
                        <div className="flex items-center">
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                            <Link href={meeting.agendaUrl} target="_blank" className="hover:text-primary transition-colors inline-flex items-center">
                                Ημερήσια Διάταξη
                                <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-1.5" />
                            </Link>
                        </div>
                    )}

                    <div className="flex items-center">
                        <FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 sm:mr-2.5" />
                        {subjects.length > 0 ? `${subjects.length} θέματα` : "Χωρίς θέματα"}
                    </div>
                </div>
            </div>
        </div>
    )
}