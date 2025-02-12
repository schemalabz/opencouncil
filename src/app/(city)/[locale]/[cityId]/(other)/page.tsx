import { notFound } from "next/navigation";
import { unstable_setRequestLocale } from "next-intl/server";
import { CityOverview } from "@/components/landing/city-overview";
import { getLandingPageData } from "@/lib/db/landing";
import City from "@/components/cities/City";
import { getCity, getFullCity } from "@/lib/db/cities";

export default async function CityPage({
    params: { cityId, locale }
}: {
    params: { cityId: string, locale: string }
}) {
    unstable_setRequestLocale(locale);

    const city = await getFullCity(cityId);

    if (!city) {
        notFound();
    }

    return <City city={city} />;
} 