import Consultations from "@/components/admin/consultations/consultations";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getConsultationsForAdmin, getAdminCityOptions } from "@/lib/db/consultations";

export default async function Page() {
    await withUserAuthorizedToEdit({});
    const [consultations, cities] = await Promise.all([
        getConsultationsForAdmin(),
        getAdminCityOptions(),
    ]);
    return <Consultations initialConsultations={consultations} initialCities={cities} />;
}
