import { useLocale, useTranslations } from "next-intl";
import { CouncilMeetingWithAdminBody } from "@/lib/db/meetings";
import { CityWithGeometry } from "@/lib/db/cities";
import { formatDateTime } from "@/lib/formatters/time";
import { getLocalizedName } from "@/lib/formatters/name";

interface MeetingInfoSlideProps {
    meeting: CouncilMeetingWithAdminBody;
    city: CityWithGeometry;
    agendaCount: number;
}

export default function MeetingInfoSlide({ meeting, city, agendaCount }: MeetingInfoSlideProps) {
    const t = useTranslations("presentation");
    const locale = useLocale();

    return (
        <div className="flex flex-col items-center justify-center h-full w-full px-[6vw] text-center gap-[4vh]">
            <div className="text-[6vw] font-bold leading-[1] max-w-[90%]">
                {getLocalizedName(meeting, locale)}
            </div>
            <div className="text-[4vh] text-muted-foreground">
                {formatDateTime(new Date(meeting.dateTime), city.timezone, 'long', locale)}
            </div>
            <div className="text-[3vh] text-muted-foreground">
                {t("subjectCount", { count: agendaCount })}
            </div>
        </div>
    );
}
