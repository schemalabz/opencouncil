import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { TopicFilter } from '@/components/filters/TopicFilter';
import { useTopics } from '@/hooks/useTopics';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';

interface NotificationTopicStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
}

export function NotificationTopicStep({ currentStep, totalSteps, onBack, onContinue }: NotificationTopicStepProps) {
  const { selectedTopics, setSelectedTopics } = useOnboarding();
  const { topics, isLoading, error } = useTopics();

  return (
    <OnboardingStepTemplate
      title="Θέματα ενδιαφέροντος"
      description="Επιλέξτε θέματα για τα οποία θέλετε να λαμβάνετε ενημερώσεις"
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
        <TopicFilter
          topics={topics}
          selectedTopics={selectedTopics}
          onChange={setSelectedTopics}
          isLoading={isLoading}
          error={error}
          columns={2}
        />
      </div>
    </OnboardingStepTemplate>
  );
}
