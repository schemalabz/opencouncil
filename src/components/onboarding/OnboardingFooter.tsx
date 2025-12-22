import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OnboardingFooterProps {
  currentStep: number; // 0-based
  totalSteps: number;
  onBack: () => void;
  onAction: () => void;
  actionLabel: string;
  isActionDisabled?: boolean;
  hideBack?: boolean;
}

export function OnboardingFooter({
  currentStep,
  totalSteps,
  onBack,
  onAction,
  actionLabel,
  isActionDisabled,
  hideBack,
}: OnboardingFooterProps) {
  return (
    <div className="flex items-center justify-between w-full p-4 md:p-3 pt-2 gap-2 md:gap-0">
      {/* Back Button */}
      <div className="flex-1 flex justify-start min-w-0">
        {!hideBack && (
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-primary h-11 md:h-10 px-4 md:px-3 touch-manipulation"
          >
            Πίσω
          </Button>
        )}
      </div>

      {/* Horizontal Bars Progress Indicator */}
      <div className="flex flex-row items-center flex-shrink-0 gap-1.5 md:gap-2 min-h-[44px] md:min-h-[32px] px-2">
        {Array.from({ length: totalSteps }).map((_, idx) => (
          <span
            key={idx}
            className={cn(
              'h-2.5 md:h-2 rounded-full transition-all duration-300',
              idx === currentStep
                ? 'bg-primary w-8 md:w-8 shadow-lg'
                : idx < currentStep
                ? 'bg-primary/50 w-6 md:w-6'
                : 'bg-muted-foreground/30 w-4 md:w-4'
            )}
          />
        ))}
      </div>

      {/* Action Button */}
      <div className="flex-1 flex justify-end min-w-0">
        <Button
          variant="default"
          onClick={onAction}
          disabled={isActionDisabled}
          className="min-w-[96px] h-11 md:h-10 px-4 md:px-4 touch-manipulation"
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
} 