'use client';

import React from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { TopicSelector } from '@/components/onboarding/selectors/TopicSelector';
import { OnboardingStepTemplate } from '@/components/onboarding/OnboardingStepTemplate';
import { OnboardingFooter } from '@/components/onboarding/OnboardingFooter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
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
      title="Μείνετε συντονισμένοι!"
      description={
        <span className="flex items-center gap-1.5">
          Επιλέξτε τις κατηγορίες για θέματα που σας ενδιαφέρουν για να λαμβάνετε προσωποποιημένες ειδοποιήσεις.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-sm">
                <p>Με βάση αυτές τις επιλογές και τις επιλογές που σε ενδιαφέρουν, θα λαμβάνεις ενημερώσεις στο email ή το κινητό σου, με όσα πραγματικά έχουν σημασία για εσένα.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      }
      footer={
        <OnboardingFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onAction={onContinue}
          actionLabel="Επόμενο βήμα"
          hideBack
        />
      }
    >
      <div className="flex flex-col gap-6 w-full">
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