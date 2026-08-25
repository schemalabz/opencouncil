import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getRealm } from "@/lib/realm.server";
import { hasExplainPage } from "@/lib/explain/availability";
import { getCityCached } from "@/lib/cache";
import { notFound } from "next/navigation";
import { getLocalizedName } from "@/lib/formatters/name";

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

    const [city, realm] = await Promise.all([getCityCached(cityId), getRealm()]);
    if (!city) notFound();

    // Build the path elements
    const pathElements: PathElement[] = [
        {
            name: getLocalizedName(city, locale),
            link: `/${cityId}`,
            city: city
        }
    ];

    return (
        <>
            <Header
                path={pathElements}
                currentEntity={{ cityId: city.id }}
                showExplain={hasExplainPage(realm)}
            />
            {children}
            <Footer realm={realm} />
        </>
    );
}
