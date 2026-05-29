import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached } from "@/lib/cache";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";

export async function generateMetadata({
    params: { cityId, locale }
}: {
    params: { cityId: string; locale: string }
}): Promise<Metadata> {
    return {
        alternates: buildHreflangAlternates(`/${cityId}`, locale),
    };
}

export default async function MeetingsPage({
    params: { cityId },
    searchParams
}: {
    params: { cityId: string };
    searchParams: { page?: string };
}) {
    const pageNumber = parseInt(searchParams.page || '1', 10);
    const currentPage = isNaN(pageNumber) || pageNumber < 1 ? 1 : pageNumber;
    const pageSize = 12;

    const [city, councilMeetings] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsForCityCached(cityId, {}),
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
            currentPage={currentPage}
            pageSize={pageSize}
        />
    );
} 