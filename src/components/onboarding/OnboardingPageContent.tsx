'use client';

import { OnboardingStage } from '@/lib/types/onboarding';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { FormContainer } from './containers/FormContainer';
import { MapContainer } from './containers/MapContainer';
import { CityWithGeometry } from '@/lib/db/cities';

interface OnboardingPageContentProps {
    initialStage: OnboardingStage;
    cityId: string;
    city: CityWithGeometry;
}

function OnboardingPageContentInner() {
    return (
        <div className="relative h-screen w-full overflow-hidden">
            <MapContainer />
            <FormContainer />
        </div>
    );
}

export function OnboardingPageContent(props: OnboardingPageContentProps) {
    return (
        <OnboardingProvider city={props.city} initialStage={props.initialStage}>
            <OnboardingPageContentInner />
        </OnboardingProvider>
    );
} 