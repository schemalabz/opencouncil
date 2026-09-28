import { getCityCached } from "@/lib/cache";
import { getConsultationById } from "@/lib/db/consultations";
import { notFound } from "next/navigation";

interface ConsultationLayoutProps {
    children: React.ReactNode;
    params: Promise<{ locale: string; cityId: string; id: string }>;
}

/**
 * Only the checks every consultation page shares. The consultation draws its own header, so a reader
 * sees one bar, not the site's and the consultation's; the printable comments page adds the site's.
 */
export default async function ConsultationLayout(props: ConsultationLayoutProps) {
    const { cityId, id } = await props.params;

    const [city, consultation] = await Promise.all([
        getCityCached(cityId),
        getConsultationById(cityId, id),
    ]);

    if (!city || !city.consultationsEnabled || !consultation) {
        notFound();
    }

    return <>{props.children}</>;
}
