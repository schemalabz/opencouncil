import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getMeetingDataCached } from "@/lib/getMeetingData";
import { categorizeSubjects } from "@/lib/utils/subjects";
import { sortSubjectsByAgendaIndex } from "@/lib/utils";
import PresentationView from "@/components/presentation/PresentationView";

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    const t = await getTranslations({ locale, namespace: "presentation" });

    return {
        title: t("pageTitle"),
        // Fullscreen presentation of the meeting page's content — the meeting URL
        // is the indexable version.
        robots: { index: false, follow: false },
    };
}

export default async function PresentationPage(
    props: {
        params: Promise<{ cityId: string; meetingId: string; locale: string }>;
    }
) {
    const params = await props.params;

    const {
        cityId,
        meetingId
    } = params;

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
