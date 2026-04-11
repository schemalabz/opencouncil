"use client";

import { CouncilMeetingWithAdminBody } from "@/lib/db/meetings";
import { CityWithGeometry } from "@/lib/db/cities";
import { formatDateTime } from "@/lib/formatters/time";

interface MeetingInfoSlideProps {
    meeting: CouncilMeetingWithAdminBody;
    city: CityWithGeometry;
    agendaCount: number;
}

export default function MeetingInfoSlide({ meeting, city, agendaCount }: MeetingInfoSlideProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full px-[6vw] text-center gap-[4vh]">
            <div className="text-[6vw] font-bold leading-[1] max-w-[90%]">
                {meeting.name}
            </div>
            <div className="text-[4vh] text-muted-foreground">
                {formatDateTime(new Date(meeting.dateTime), city.timezone)}
            </div>
            <div className="text-[3vh] text-muted-foreground">
                {agendaCount > 0
                    ? `${agendaCount} θέματα`
                    : "Χωρίς θέματα"}
            </div>
        </div>
    );
}
