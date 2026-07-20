import { Metadata } from "next";
import { OnboardingPageContent } from "@/components/onboarding/OnboardingPageContent";
import { OnboardingStage } from '@/lib/types/onboarding';
import { Suspense } from "react";
import { getCity } from "@/lib/db/cities";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';

export async function generateMetadata(props: {
    params: Promise<{ cityId: string }>;
}): Promise<Metadata> {
    const { cityId } = await props.params;
    const t = await getTranslations("Onboarding.petition");
    return {
        title: t("metaTitle"),
        description: t("metaDescription"),
        alternates: await buildCanonicalAlternates(`/${cityId}/petition`),
    };
}

interface PageProps {
    params: Promise<{ cityId: string }>;
}

export default async function PetitionSignupPage(props: PageProps) {
    const params = await props.params;
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