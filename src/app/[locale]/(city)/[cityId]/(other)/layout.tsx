import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getCityCached } from "@/lib/cache";
import { notFound } from "next/navigation";

export default async function CityInnerLayout(
    props: {
        children: React.ReactNode,
        params: Promise<{ locale: string, cityId: string }>
    }
) {
    const params = await props.params;

    const {
        locale,
        cityId
    } = params;

    const {
        children
    } = props;

    const city = await getCityCached(cityId);
    if (!city) notFound();

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
