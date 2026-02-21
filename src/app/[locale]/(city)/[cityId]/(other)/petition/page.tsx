import { Metadata } from "next";
import { OnboardingPageContent } from "@/components/onboarding/OnboardingPageContent";
import { OnboardingStage } from '@/lib/types/onboarding';
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Υποστήριξη Δήμου | OpenCouncil",
    description: "Υποστηρίξτε την προσθήκη του δήμου σας στο OpenCouncil",
};

interface PageProps {
    params: { cityId: string };
}

export default async function PetitionSignupPage({ params }: PageProps) {
    // Fetch city data with geometry at the server level
    const city = await getCity(params.cityId, { includeGeometry: true });
    
    if (!city) {
        notFound();
    }

    if (city.supportsNotifications) {
        // Redirect to notifications page if city already supports notifications
        redirect(`/${params.cityId}/notifications`);
    }

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        }>
            <OnboardingPageContent 
                initialStage={OnboardingStage.PETITION_INFO} 
                cityId={params.cityId}
                city={city}
            />
        </Suspense>
    );
} 