import Consultations from "@/components/admin/consultations/consultations";
import { getAdminRealms } from "@/lib/auth";
import { getConsultationsForAdmin, getAdminCityOptions } from "@/lib/db/consultations";

export default async function Page() {
    const realms = await getAdminRealms();
    const [consultations, cities] = await Promise.all([
        getConsultationsForAdmin(realms),
        getAdminCityOptions(realms),
    ]);
    return <Consultations initialConsultations={consultations} initialCities={cities} />;
}
