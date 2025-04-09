import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached } from "@/lib/cache";

export default async function MeetingsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [city, councilMeetings] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsForCityCached(cityId)
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