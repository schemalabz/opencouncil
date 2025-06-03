'use client';

import React from 'react';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { UserInfoForm, UserInfoFormData } from '@/components/onboarding/UserInfoForm';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useSession } from 'next-auth/react';
import { PreferencesOverview } from '@/components/onboarding/PreferencesOverview';
import { ErrorMessage } from '@/components/onboarding/ErrorMessage';
import { useTranslations } from 'next-intl';

interface PetitionRegistrationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
}

export function PetitionRegistrationStep({ currentStep, totalSteps, onBack }: PetitionRegistrationStepProps) {
  const {
    petitionData,
    handlePetitionRegistration,
    isUpdating,
    error,
    emailExistsError
  } = useOnboarding();
  const { data: session } = useSession();
  const t = useTranslations('Onboarding');

  const handleSubmit = async (data: UserInfoFormData) => {
    await handlePetitionRegistration(
      data.email || '',
      data.phone
    );
  };

  return (
    <OnboardingStepTemplate
      title="Ολοκληρώστε την εγγραφή σας"
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={() => {
            const form = document.querySelector('form');
            form?.requestSubmit();
          }}
          actionLabel={isUpdating ? t('submitting') : t('continue')}
          isActionDisabled={isUpdating}
        />
      }
    >
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">Σύνοψη επιλογών</h3>
        <PreferencesOverview
          petitionData={petitionData}
        />
      </div>

      <ErrorMessage error={error} emailExistsError={emailExistsError} />

      <UserInfoForm
        onSubmit={handleSubmit}
        initialData={{
          name: petitionData.name,
          email: session?.user?.email || '',
          phone: session?.user?.phone || ''
        }}
        isSubmitting={isUpdating}
        showName={false}
        showEmail={true}
        showPhone={true}
        requireEmail={true}
        requirePhone={false}
      />
    </OnboardingStepTemplate>
  );
} 