import { getCities } from "@/lib/db/cities";
import { getAdminRealms } from "@/lib/auth";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { ALL_REALMS } from "@/lib/realm";
import { CitiesAdminTable } from "@/components/admin/cities/cities-table";

export default async function CitiesAdminPage() {
    // Superadmins see every city; realm admins the cities of their realms.
    // Includes unlisted + pending so the admin view is complete.
    const realms = await getAdminRealms();
    const cities = await getCities({ includeNonPublic: true }, realms);
    // A city lives on its realm's domain, which is not always the admin host.
    const rows = cities.map((city) => ({ ...city, siteUrl: realmBaseUrl(city.realm) }));
    return <CitiesAdminTable cities={rows} realms={realms ?? [...ALL_REALMS]} />;
}
