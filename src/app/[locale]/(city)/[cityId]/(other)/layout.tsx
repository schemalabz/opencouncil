import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import { getCity } from "@/lib/db/cities";
import Footer from "@/components/layout/Footer";

export default async function CityInnerLayout({
    children,
    params: { locale, cityId }
}: {
    children: React.ReactNode,
    params: { locale: string, cityId: string }
}) {

    const city = await getCity(cityId);
    if (!city) return null;

    // Build the path elements
    const pathElements: PathElement[] = [
        {
            name: city.name,
            link: `/${cityId}`,
            city: city
        }
    ];

    return (
        <>
            <Header
                path={pathElements}
                currentEntity={{ cityId: city.id }}
            />
            {children}
            <Footer />
        </>
    );
}
