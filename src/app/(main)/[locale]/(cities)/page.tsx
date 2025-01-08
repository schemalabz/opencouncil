import { Landing } from "@/components/landing/landing";
import { getLandingPageData } from '@/lib/db/landing';

export default async function CitiesPage() {
    const cities = await getLandingPageData();

    return (
        <Landing publicCities={cities} />
    )
}