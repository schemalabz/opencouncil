import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { TopicSelector } from '@/components/onboarding/selectors/TopicSelector';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { Topic } from '@prisma/client';

interface NotificationTopicStepProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
}

export function NotificationTopicStep({ currentStep, totalSteps, onBack, onContinue }: NotificationTopicStepProps) {
  const {
    selectedTopics,
    setSelectedTopics,
  } = useOnboarding();

  const handleTopicSelect = (topic: Topic) => {
    setSelectedTopics([...selectedTopics, topic]);
  };

  const handleTopicRemove = (topicId: string) => {
    setSelectedTopics(selectedTopics.filter(topic => topic.id !== topicId));
  };

  const handleRemoveAll = () => {
    setSelectedTopics([]);
  };

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
        <TopicSelector
          selectedTopics={selectedTopics}
          onSelect={handleTopicSelect}
          onRemove={handleTopicRemove}
          onRemoveAll={handleRemoveAll}
        />
      </div>
    </OnboardingStepTemplate>
  );
} 