import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCouncilMeetingsForCity } from "@/lib/db/meetings";
import { getCity } from "@/lib/db/cities";

export default async function MeetingsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [city, councilMeetings] = await Promise.all([
        getCity(cityId),
        getCouncilMeetingsForCity(cityId)
    ]);

    if (!city) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityMeetings 
            councilMeetings={councilMeetings}
            cityId={cityId}
            timezone={city.timezone}
            canEdit={canEdit}
        />
    );
} 