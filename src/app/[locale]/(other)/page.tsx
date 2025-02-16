import { getLandingPageData } from "@/lib/db/landing";
import { Landing } from "@/components/landing/landing";

export default async function HomePage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    const data = await getLandingPageData();
    return <Landing publicCities={data.cities} latestPost={data.latestPost} />;
} 