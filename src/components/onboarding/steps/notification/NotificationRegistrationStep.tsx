'use client';

import React, { useState } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { UserInfoForm, UserInfoFormData } from '@/components/onboarding/UserInfoForm';
import { useSession } from 'next-auth/react';
import { PreferencesOverview } from '@/components/onboarding/PreferencesOverview';
import { ErrorMessage } from '@/components/onboarding/ErrorMessage';
import { useTranslations } from 'next-intl';
import { Bell, Info } from 'lucide-react';

interface NotificationRegistrationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
}

export function NotificationRegistrationStep({ currentStep, totalSteps, onBack }: NotificationRegistrationStepProps) {
  const { selectedLocations, selectedTopics, handleNotificationRegistration, isUpdating, emailExistsError, error } = useOnboarding();
  const { data: session, status: sessionStatus } = useSession();
  const t = useTranslations('Onboarding');
  const [missingRequired, setMissingRequired] = useState<Array<'name' | 'email'>>([]);

  const isLoggedIn = sessionStatus === 'authenticated' && !!session?.user;

  const handleSubmit = async (data: UserInfoFormData) => {
    await handleNotificationRegistration(
      data.email || '',
      data.phone,
      data.name
    );
  };

  // For an authenticated session we only update preferences against the
  // existing user (no account is created), so reassure accordingly. For an
  // anonymous visitor we stay account-neutral, since submitting a new email
  // can create a user record.
  const title = isLoggedIn ? t('regTitleLoggedIn') : t('regTitleAnon');
  const body = isLoggedIn ? t('regBodyLoggedIn') : t('regBodyAnon');

  const missingLabels = missingRequired.map(field =>
    field === 'name' ? t('fieldName') : t('fieldEmail')
  );

  return (
    <OnboardingStepTemplate
      title={title}
      description={
        <div className="space-y-3">
          <p className="text-sm md:text-base text-muted-foreground">{body}</p>
          {missingLabels.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              <Info className="h-4 w-4 flex-none" />
              <span>{t('stillNeeded', { fields: missingLabels.join(', ') })}</span>
            </div>
          )}
        </div>
      }
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={() => {
            const form = document.querySelector('form');
            if (form) form.requestSubmit();
          }}
          actionLabel={isUpdating ? t('submitting') : t('save')}
          isActionDisabled={isUpdating}
        />
      }
    >
      <p className="flex items-start gap-2 mb-6 text-sm text-muted-foreground">
        <Bell className="h-4 w-4 flex-none mt-0.5" />
        <span>{t('sendTiming')}</span>
      </p>

      <div className="mb-6">
        <h3 className="text-sm font-medium mb-2">{t('summaryTitle')}</h3>
        <PreferencesOverview
          locations={selectedLocations}
          topics={selectedTopics}
        />
      </div>

      <ErrorMessage error={error} emailExistsError={emailExistsError} />

      <UserInfoForm
        onSubmit={handleSubmit}
        onMissingRequiredChange={setMissingRequired}
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