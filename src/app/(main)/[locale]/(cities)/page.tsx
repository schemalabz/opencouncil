import { Landing } from "@/components/landing/landing";
import { getLandingPageData } from '@/lib/db/landing';

// Revalidate every 5 minutes (300 seconds)
export const revalidate = 300;

export default async function CitiesPage() {
    const cities = await getLandingPageData();

    return (
        <Landing publicCities={cities} />
    )
}