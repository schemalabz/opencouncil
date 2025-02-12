import { getCity } from "@/lib/db/cities";
import { notFound } from "next/navigation";
import { unstable_setRequestLocale } from "next-intl/server";

export default async function CityLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {
    unstable_setRequestLocale(locale);

    const city = await getCity(cityId);
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