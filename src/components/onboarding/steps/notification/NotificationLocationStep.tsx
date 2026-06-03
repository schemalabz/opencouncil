import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import { Location } from '@/lib/types/onboarding';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';

interface NotificationLocationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
}

export function NotificationLocationStep({ currentStep, totalSteps, onBack, onContinue }: NotificationLocationStepProps) {
  const {
    city,
    selectedLocations,
    setSelectedLocations,
  } = useOnboarding();

  if (!city) return null;

  const handleLocationSelect = (location: Location) => {
    setSelectedLocations([...selectedLocations, location]);
  };

  const handleLocationRemove = (index: number) => {
    setSelectedLocations(selectedLocations.filter((_, i) => i !== index));
  };

  return (
    <OnboardingStepTemplate
      title="Τοποθεσίες ενδιαφέροντος"
      description={`Προσθέστε διευθύνσεις ή περιοχές που σας ενδιαφέρουν — π.χ. το σπίτι, το γραφείο, μια γειτονιά ή περιοχή του δήμου.`}
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={onContinue}
          actionLabel="Συνέχεια"
        />
      }
    >
      <div className="flex flex-col gap-6 w-full max-w-md">
        <LocationSelector
          selectedLocations={selectedLocations}
          onSelect={handleLocationSelect}
          onRemove={handleLocationRemove}
          city={city}
          collapseAfterAdd
        />
      </div>
    </OnboardingStepTemplate>
  );
} 