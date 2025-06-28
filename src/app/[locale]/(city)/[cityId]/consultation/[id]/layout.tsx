import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getCityCached } from "@/lib/cache";
import { getConsultationById } from "@/lib/db/consultations";
import { notFound } from "next/navigation";

interface ConsultationLayoutProps {
    children: React.ReactNode;
    params: { locale: string; cityId: string; id: string };
}

export default async function ConsultationLayout({
    children,
    params: { locale, cityId, id }
}: ConsultationLayoutProps) {
    const [city, consultation] = await Promise.all([
        getCityCached(cityId),
        getConsultationById(cityId, id)
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!(city as any).consultationsEnabled) {
        notFound();
    }

    if (!consultation) {
        notFound();
    }

    // Build the path elements
    const pathElements: PathElement[] = [
        {
            name: city.name,
            link: `/${cityId}`,
            city: city
        },
        {
            name: "Διαβουλεύσεις",
            link: `/${cityId}/consultations`,
        },
        {
            name: consultation.name,
            link: `/${cityId}/consultation/${consultation.id}`,
        }
    ];

    return (
        <>
            <Header
                path={pathElements}
                currentEntity={{ cityId: city.id }}
            />
            {children}
            <Footer />
        </>
    );
} 