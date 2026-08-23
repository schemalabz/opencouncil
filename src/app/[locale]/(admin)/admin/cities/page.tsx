import { getCities } from "@/lib/db/cities";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { CitiesAdminTable } from "@/components/admin/cities/cities-table";

export default async function CitiesAdminPage() {
    await withUserAuthorizedToEdit({});
    // Superadmins see every city; city admins see their own. Includes unlisted +
    // pending so the admin view is complete.
    const cities = await getCities({ includeNonPublic: true });
    return <CitiesAdminTable cities={cities} />;
}
