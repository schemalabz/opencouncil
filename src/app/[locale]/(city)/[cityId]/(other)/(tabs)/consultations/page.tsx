import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityConsultations from "@/components/cities/CityConsultations";
import { getCityCached } from "@/lib/cache";
import { getConsultationsForCity } from "@/lib/db/consultations";

export const metadata: Metadata = {
    title: "Δημόσιες Διαβουλεύσεις | OpenCouncil",
    description: "Συμμετέχετε στις δημόσιες διαβουλεύσεις του δήμου σας",
};

export default async function ConsultationsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [city, consultations] = await Promise.all([
        getCityCached(cityId),
        getConsultationsForCity(cityId)
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!(city as any).consultationsEnabled) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityConsultations
            consultations={consultations}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 