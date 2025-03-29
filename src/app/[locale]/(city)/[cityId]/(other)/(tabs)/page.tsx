import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getFullCity } from "@/lib/db/cities";

export default async function MeetingsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const city = await getFullCity(cityId);

    if (!city) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityMeetings 
            councilMeetings={city.councilMeetings}
            cityId={cityId}
            timezone={city.timezone}
            canEdit={canEdit}
        />
    );
} 