'use client';

import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { UserInfoForm, UserInfoFormData } from '@/components/onboarding/UserInfoForm';
import { useSession } from 'next-auth/react';
import { PreferencesOverview } from '@/components/onboarding/PreferencesOverview';
import { ErrorMessage } from '@/components/onboarding/ErrorMessage';
import { useTranslations } from 'next-intl';

interface NotificationRegistrationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
}

export function NotificationRegistrationStep({ currentStep, totalSteps, onBack }: NotificationRegistrationStepProps) {
  const { selectedLocations, selectedTopics, handleNotificationRegistration, isUpdating, emailExistsError, error } = useOnboarding();
  const { data: session } = useSession();
  const t = useTranslations('Onboarding');

  const handleSubmit = async (data: UserInfoFormData) => {
    await handleNotificationRegistration(
      data.email || '',
      data.phone,
      data.name
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
            if (form) form.requestSubmit();
          }}
          actionLabel={isUpdating ? t('submitting') : t('continue')}
          isActionDisabled={isUpdating}
        />
      }
    >
      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">Σύνοψη επιλογών</h3>
        <PreferencesOverview
          locations={selectedLocations}
          topics={selectedTopics}
        />
      </div>

      <ErrorMessage error={error} emailExistsError={emailExistsError} />

      <UserInfoForm
        onSubmit={handleSubmit}
        initialData={{
          name: session?.user?.name || '',
          email: session?.user?.email || '',
          phone: session?.user?.phone || ''
        }}
        isSubmitting={isUpdating}
        showName={true}
        showEmail={true}
        showPhone={true}
        requireName={true}
        requireEmail={true}
        requirePhone={false}
      />
    </OnboardingStepTemplate>
  );
} 