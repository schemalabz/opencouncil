import { Metadata } from "next";
import { OnboardingPageContent } from "@/components/onboarding/OnboardingPageContent";
import { OnboardingStage } from '@/lib/types/onboarding';
import { Suspense } from "react";
import { getCity, getCitiesWithGeometry } from "@/lib/db/cities";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Εγγραφή για ενημερώσεις | OpenCouncil",
    description: "Εγγραφείτε για να λαμβάνετε ενημερώσεις για θέματα που συζητούνται στα δημοτικά συμβούλια",
};

interface PageProps {
    params: { cityId: string };
}

export default async function NotificationSignupPage({ params }: PageProps) {
    // Fetch city data with geometry at the server level
    const city = await getCity(params.cityId);
    
    if (!city) {
        // Handle city not found
        return <div>City not found</div>;
    }

    if (!city.supportsNotifications) {
        // Redirect to petition page if city doesn't support notifications
        redirect(`/${params.cityId}/petition`);
    }

    // Get city with geometry
    const [cityWithGeometry] = await getCitiesWithGeometry([city]);
    if (!cityWithGeometry) {
        return <div>Error loading city data</div>;
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
                city={cityWithGeometry}
            />
        </Suspense>
    );
} 