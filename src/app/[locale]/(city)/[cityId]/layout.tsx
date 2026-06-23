import { getAllCityIdsCached } from "@/lib/cache";
import { getRealm } from "@/lib/realm.server";
import { notFound } from "next/navigation";

const VALID_CITY_ID = /^[a-z][a-z0-9_-]*$/;

export default async function CityLayout(
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

    if (!VALID_CITY_ID.test(cityId)) {
        notFound();
    }

    // Validate against the known city set via a SINGLE shared cache key.
    // The previous getCityCached(cityId) existence check was itself a cached
    // per-city query, so every junk slug that passed the regex (e.g. /wp-admin)
    // wrote a `city:<junk>:basic` entry to the shared cache before 404ing (#358).
    // Scoped to the request realm: a city from the other realm (e.g. a French
    // city on opencouncil.gr) isn't in this set, so it 404s — tenant isolation.
    const cityIds = await getAllCityIdsCached(await getRealm());
    if (!cityIds.includes(cityId)) {
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