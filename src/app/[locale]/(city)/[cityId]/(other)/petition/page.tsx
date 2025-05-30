import { Metadata } from "next";
import { SignupPageContent } from "@/components/notifications/SignupPageContent";
import { SignupStage } from "@/lib/types/notifications";
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Υποστήριξη Δήμου | OpenCouncil",
    description: "Υποστηρίξτε την προσθήκη του δήμου σας στο OpenCouncil",
};

export default async function PetitionSignupPage({ params }: { params: { cityId: string } }) {
    // Fetch city data to verify it exists
    const city = await getCity(params.cityId);
    
    if (!city) {
        // Handle city not found
        return <div>City not found</div>;
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
            <SignupPageContent 
                initialStage={SignupStage.UNSUPPORTED_MUNICIPALITY} 
                cityId={params.cityId}
            />
        </Suspense>
    );
} 