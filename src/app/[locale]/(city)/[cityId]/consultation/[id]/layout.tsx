import Header from "@/components/layout/Header";
import { PathElement } from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getCityCached } from "@/lib/cache";
import { getConsultationById } from "@/lib/db/consultations";
import { notFound } from "next/navigation";
import { getLocalizedName } from "@/lib/formatters/name";
import { localizeText } from "@/lib/serbian";

interface ConsultationLayoutProps {
    children: React.ReactNode;
    params: Promise<{ locale: string; cityId: string; id: string }>;
}

export default async function ConsultationLayout(props: ConsultationLayoutProps) {
    const params = await props.params;

    const {
        locale,
        cityId,
        id
    } = params;

    const {
        children
    } = props;

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
            name: getLocalizedName(city, locale),
            link: `/${cityId}`,
            city: city
        },
        {
            name: "Διαβουλεύσεις",
            link: `/${cityId}/consultations`,
        },
        {
            name: localizeText(consultation.name, locale),
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