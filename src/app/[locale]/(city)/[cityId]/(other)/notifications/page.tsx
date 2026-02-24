import { Metadata } from "next";
import { OnboardingPageContent } from "@/components/onboarding/OnboardingPageContent";
import { OnboardingStage } from '@/lib/types/onboarding';
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Εγγραφή για ενημερώσεις | OpenCouncil",
    description: "Εγγραφείτε για να λαμβάνετε ενημερώσεις για θέματα που συζητούνται στα δημοτικά συμβούλια",
};

interface PageProps {
    params: { cityId: string };
}

export default async function NotificationSignupPage({ params }: PageProps) {
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