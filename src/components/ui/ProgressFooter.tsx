import React from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';

interface ProgressFooterProps {
  currentStep: number; // 0-based
  totalSteps: number;
  onBack: () => void;
  onAction: () => void;
  actionLabel: string;
  isActionDisabled?: boolean;
  hideBack?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function ProgressFooter({
  currentStep,
  totalSteps,
  onBack,
  onAction,
  actionLabel,
  isActionDisabled,
  hideBack,
  isOpen,
  onClose,
}: ProgressFooterProps) {
  const t = useTranslations('components.ui.ProgressFooter');

  return (
    <div className="flex items-center justify-between w-full pt-6">
      {/* Back Button */}
      <div className="flex-1 flex justify-start">
        {!hideBack && (
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-primary"
          >
            {t('back')}
          </Button>
        )}
      </div>

      {/* Horizontal Bars Progress Indicator */}
      <div className="flex flex-row items-center flex-shrink-0 gap-2 min-h-[32px]">
        {Array.from({ length: totalSteps }).map((_, idx) => (
          <span
            key={idx}
            className={cn(
              'h-2 rounded-full transition-colors',
              idx === currentStep
                ? 'bg-primary w-8 shadow-lg'
                : 'bg-muted-foreground/30 w-4'
            )}
          />
        ))}
      </div>

      {/* Action Button */}
      <div className="flex-1 flex justify-end">
        <Button
          variant="default"
          onClick={onAction}
          disabled={isActionDisabled}
          className="min-w-[96px]"
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
} 