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
import { Bell, ChevronRight } from 'lucide-react';

interface NotificationRegistrationStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
}

export function NotificationRegistrationStep({ currentStep, totalSteps, onBack }: NotificationRegistrationStepProps) {
  const { selectedLocations, selectedTopics, handleNotificationRegistration, isUpdating, emailExistsError, error } = useOnboarding();
  const { data: session, status: sessionStatus } = useSession();
  const t = useTranslations('Onboarding');

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

  return (
    <OnboardingStepTemplate
      title={title}
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
      {/* Step 3 is about personal data, so the fields lead. The explanatory
          text (no-account reassurance + send timing) moves into a collapsible
          below, following the GOV.UK "details" pattern, so users reach the
          fields without scrolling past prose. */}
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

      <div className="mt-6">
        <h3 className="text-sm font-medium mb-2">{t('summaryTitle')}</h3>
        <PreferencesOverview
          locations={selectedLocations}
          topics={selectedTopics}
        />
      </div>

      <details className="group mt-6">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 flex-none transition-transform group-open:rotate-90"
          />
          <span>{t('detailsSummary')}</span>
        </summary>
        <div className="mt-2 space-y-2 border-l-2 border-muted pl-3 text-sm text-muted-foreground">
          <p>{body}</p>
          <p className="flex items-start gap-2">
            <Bell aria-hidden="true" className="h-4 w-4 flex-none mt-0.5" />
            <span>{t('sendTiming')}</span>
          </p>
        </div>
      </details>
    </OnboardingStepTemplate>
  );
} 