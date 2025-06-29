import { Metadata } from "next";
import { getCityCached } from "@/lib/cache";
import { getConsultationById } from "@/lib/db/consultations";
import { notFound } from "next/navigation";
import { ConsultationViewer } from "@/components/consultations";

interface PageProps {
    params: { cityId: string; id: string };
}

interface RegulationData {
    title: string;
    contactEmail?: string;
    regulation: RegulationItem[];
}

interface RegulationItem {
    type: 'chapter' | 'geoset';
    id: string;
    title?: string;
    name?: string;
    summary?: string;
    description?: string;
    preludeBody?: string;
    articles?: Article[];
    geometries?: any[];
}

interface Article {
    num: number;
    id: string;
    title: string;
    summary?: string;
    body: string;
}

async function fetchRegulationData(jsonUrl: string): Promise<RegulationData | null> {
    try {
        // Handle relative URLs by prepending the base URL
        const url = jsonUrl.startsWith('http') ? jsonUrl : `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${jsonUrl}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            console.error(`Failed to fetch regulation data: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching regulation data:', error);
        return null;
    }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const consultation = await getConsultationById(params.cityId, params.id);

    if (!consultation) {
        return {
            title: "Διαβούλευση δεν βρέθηκε | OpenCouncil",
        };
    }

    return {
        title: `${consultation.name} | OpenCouncil`,
        description: `Διαβούλευση για ${consultation.name}`,
    };
}

export default async function ConsultationPage({ params }: PageProps) {
    const [city, consultation] = await Promise.all([
        getCityCached(params.cityId),
        getConsultationById(params.cityId, params.id)
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

    // Fetch regulation data
    const regulationData = await fetchRegulationData(consultation.jsonUrl);

    // Base URL for permalinks
    const baseUrl = `/${params.cityId}/consultation/${params.id}`;

    return (
        <ConsultationViewer
            consultation={consultation}
            regulationData={regulationData}
            baseUrl={baseUrl}
        />
    );
} 