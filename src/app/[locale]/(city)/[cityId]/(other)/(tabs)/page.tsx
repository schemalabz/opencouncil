import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached, getCouncilMeetingsCountForCityCached } from "@/lib/cache";

export default async function MeetingsPage({
    params: { cityId },
    searchParams
}: {
    params: { cityId: string };
    searchParams: { page?: string };
}) {
    const currentPage = parseInt(searchParams.page || '1', 10);
    const pageSize = 12;

    const [city, councilMeetings, totalCount] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsForCityCached(cityId, { page: currentPage, pageSize }),
        getCouncilMeetingsCountForCityCached(cityId)
    ]);

    if (!city) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });
    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <CityMeetings
            councilMeetings={councilMeetings}
            cityId={cityId}
            timezone={city.timezone}
            canEdit={canEdit}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
        />
    );
} 