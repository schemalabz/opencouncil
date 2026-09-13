import { notFound } from "next/navigation";
import Header, { type PathElement } from "@/components/layout/Header";
import { getCityCached } from "@/lib/cache";
import { hasExplainPage } from "@/lib/explain/availability";
import { getLocalizedName } from "@/lib/formatters/name";
import { getRealm } from "@/lib/realm.server";

/**
 * The header of a page under /{cityId}: the crumb to the city and the
 * city's context menu. A layout that puts one above its pages renders this
 * instead of building the crumb itself, so the two layouts under
 * `[cityId]` (with a footer and without) agree on it. A city that does not
 * exist is a 404 here, before any page runs.
 */
export async function CityHeader({ cityId, locale }: { cityId: string; locale: string }) {
    const [city, realm] = await Promise.all([getCityCached(cityId), getRealm()]);
    if (!city) notFound();

    const path: PathElement[] = [{ name: getLocalizedName(city, locale), link: `/${cityId}`, city }];
    return <Header path={path} currentEntity={{ cityId: city.id }} showExplain={hasExplainPage(realm)} />;
}
