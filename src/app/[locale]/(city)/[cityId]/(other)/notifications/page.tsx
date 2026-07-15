import { Metadata } from "next";
import { OnboardingPageContent } from "@/components/onboarding/OnboardingPageContent";
import { OnboardingStage } from '@/lib/types/onboarding';
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { getCityCached } from "@/lib/cache";
import { notFound, redirect } from "next/navigation";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";

export async function generateMetadata(props: { params: Promise<{ cityId: string }> }): Promise<Metadata> {
    const params = await props.params;
    const city = await getCityCached(params.cityId);

    if (!city) {
        notFound();
    }

    return {
        title: "Εγγραφή για ενημερώσεις | OpenCouncil",
        description: "Εγγραφείτε για να λαμβάνετε ενημερώσεις για θέματα που συζητούνται στα δημοτικά συμβούλια",
        alternates: await buildCanonicalAlternates(`/${params.cityId}/notifications`),
    };
}

interface PageProps {
    params: Promise<{ cityId: string }>;
}

export default async function NotificationSignupPage(props: PageProps) {
    const params = await props.params;
    // Fetch city data with geometry at the server level
    const city = await getCity(params.cityId, { includeGeometry: true });

    if (!city) {
        notFound();
    }

    if (!city.supportsNotifications) {
        // Redirect to petition page if city doesn't support notifications
        redirect(`/${params.cityId}/petition`);
    }

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        }>
            <OnboardingPageContent 
                initialStage={OnboardingStage.NOTIFICATION_INFO} 
                cityId={params.cityId}
                city={city}
            />
        </Suspense>
    );
} 