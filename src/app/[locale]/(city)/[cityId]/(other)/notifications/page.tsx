import { Metadata } from "next";
import { SignupPageContent } from "@/components/notifications/SignupPageContent";
import { SignupStage } from "@/lib/types/notifications";
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Εγγραφή για ενημερώσεις | OpenCouncil",
    description: "Εγγραφείτε για να λαμβάνετε ενημερώσεις για θέματα που συζητούνται στα δημοτικά συμβούλια",
};

export default async function NotificationSignupPage({ params }: { params: { cityId: string } }) {
    // Fetch city data to verify it supports notifications
    const city = await getCity(params.cityId);
    
    if (!city) {
        // Handle city not found
        return <div>City not found</div>;
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
            <SignupPageContent 
                initialStage={SignupStage.LOCATION_TOPIC_SELECTION} 
                cityId={params.cityId}
            />
        </Suspense>
    );
} 