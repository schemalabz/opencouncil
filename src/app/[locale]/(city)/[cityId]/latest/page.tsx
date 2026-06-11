import { redirect } from "next/navigation";
import { getLatestReleasedMeetingIdForCity } from "@/lib/db/meetings";

interface PageProps {
    params: Promise<{ cityId: string }>;
}

export default async function LatestMeetingPage(props: PageProps) {
    const params = await props.params;
    const meetingId = await getLatestReleasedMeetingIdForCity(params.cityId);

    if (meetingId) {
        redirect(`/${params.cityId}/${meetingId}`);
    }

    redirect(`/${params.cityId}`);
}
