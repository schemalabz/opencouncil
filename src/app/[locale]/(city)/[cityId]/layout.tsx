import { getCityCached } from "@/lib/cache";
import { notFound } from "next/navigation";

const VALID_CITY_ID = /^[a-z][a-z0-9_-]*$/;

export default async function CityLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {

    if (!VALID_CITY_ID.test(cityId)) {
        notFound();
    }

    const city = await getCityCached(cityId);
    if (!city) {
        notFound();
    }

    return (
        <div className="min-h-screen flex flex-col">
            <main id="main-content" className="flex-1">
                {children}
            </main>
        </div>
    );
} 