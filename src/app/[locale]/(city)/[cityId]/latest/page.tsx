import { redirect } from "next/navigation";
import { getLatestReleasedMeetingIdForCity } from "@/lib/db/meetings";

interface PageProps {
    params: { cityId: string };
}

export default async function LatestMeetingPage({ params }: PageProps) {
    const meetingId = await getLatestReleasedMeetingIdForCity(params.cityId);

    if (meetingId) {
        redirect(`/${params.cityId}/${meetingId}`);
    }

    redirect(`/${params.cityId}`);
}
