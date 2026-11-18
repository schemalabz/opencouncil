import { notFound, redirect } from "next/navigation";
import { getLatestReleasedMeetingIdForCity } from "@/lib/db/meetings";
import { getAdministrativeBodiesWithPublicMeetingsCached, getCityCached } from "@/lib/cache";
import { isSecondaryBody, tabTier } from "@/lib/utils/bodyTier";

interface PageProps {
    params: Promise<{ cityId: string }>;
}

export default async function LatestMeetingPage(props: PageProps) {
    const params = await props.params;
    const [city, bodies] = await Promise.all([
        getCityCached(params.cityId),
        getAdministrativeBodiesWithPublicMeetingsCached(params.cityId),
    ]);
    if (!city) {
        notFound();
    }

    const tier = tabTier({
        requested: null,
        secondaryAvailable: bodies.some(isSecondaryBody),
        administersSecondary: false,
        primaryEmpty: city._count.councilMeetings === 0,
    });
    const meetingId = await getLatestReleasedMeetingIdForCity(params.cityId, tier);

    if (meetingId) {
        redirect(`/${params.cityId}/${meetingId}`);
    }

    redirect(`/${params.cityId}`);
}
