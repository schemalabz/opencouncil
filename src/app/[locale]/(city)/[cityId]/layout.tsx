import { isCityOfRealm } from "@/lib/db/cityRealm";
import { getRealm } from "@/lib/realm.server";
import { notFound } from "next/navigation";

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

    // The proxy answers 404 for an unknown city before this layout renders.
    // The layout checks again, because a request can reach it without the
    // proxy's answer (the proxy lets a request continue when its read fails).
    // Scoped to the request realm: a city from the other realm (e.g. a French
    // city on opencouncil.gr) isn't a city here, so it 404s — tenant isolation.
    if (!(await isCityOfRealm(cityId, await getRealm()))) {
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