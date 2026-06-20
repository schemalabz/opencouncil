import { getCities } from "@/lib/db/cities";
import { CitiesAdminTable } from "@/components/admin/cities/cities-table";

export default async function CitiesAdminPage() {
    // Superadmins see every city; city admins see their own. Includes unlisted +
    // pending so the admin view is complete.
    const cities = await getCities({ includeUnlisted: true, includePending: true });
    return <CitiesAdminTable cities={cities} />;
}
