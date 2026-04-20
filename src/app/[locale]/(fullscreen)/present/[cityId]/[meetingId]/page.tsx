import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getMeetingDataCached } from "@/lib/getMeetingData";
import { categorizeSubjects } from "@/lib/utils/subjects";
import { sortSubjectsByAgendaIndex } from "@/lib/utils";
import PresentationView from "@/components/presentation/PresentationView";

export const metadata = {
    title: "Παρουσίαση συνεδρίασης | OpenCouncil",
};

export default async function PresentationPage({
    params: { cityId, meetingId },
}: {
    params: { cityId: string; meetingId: string; locale: string };
}) {
    const editable = await isUserAuthorizedToEdit({ cityId });
    if (!editable) {
        notFound();
    }

    const data = await getMeetingDataCached(cityId, meetingId);
    if (!data || !data.city) {
        notFound();
    }

    // Show before-agenda items first, followed by agenda items (sorted by index).
    // Out-of-agenda items are intentionally excluded from the presentation view.
    const { beforeAgenda, agenda } = categorizeSubjects(data.subjects);
    const agendaSubjects = [
        ...beforeAgenda,
        ...sortSubjectsByAgendaIndex(agenda),
    ];

    return (
        <PresentationView
            meeting={data.meeting}
            city={data.city}
            agendaSubjects={agendaSubjects}
            backHref={`/${cityId}/${meetingId}`}
        />
    );
}
