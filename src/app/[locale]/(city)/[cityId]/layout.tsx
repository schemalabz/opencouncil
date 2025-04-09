import { getCityCached } from "@/lib/cache";
import { notFound } from "next/navigation";

export default async function CityLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {

    const city = await getCityCached(cityId);
    if (!city) {
        notFound();
    }

    return (
        <div className="min-h-screen flex flex-col">
            <main className="flex-1">
                {children}
            </main>
        </div>
    );
} 