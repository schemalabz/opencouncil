import React from 'react';

interface OnboardingStepTemplateProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function OnboardingStepTemplate({ title, description, children, footer }: OnboardingStepTemplateProps) {
  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto bg-white pt-4 md:pt-6">
      {/* Header section */}
      <div className="flex-none px-4 md:px-6 lg:px-8 pb-2">
        <h2 className="text-lg md:text-xl font-bold mb-1 text-primary">{title}</h2>
        {description && <div className="text-muted-foreground mt-4 md:mt-6 text-sm md:text-base">{description}</div>}
      </div>

      {/* Scrollable content section */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 px-4 md:px-6 lg:px-8 pb-2">
        {children}
      </div>

      {/* Sticky footer section */}
      <div className="flex-none border-t bg-white/95 backdrop-blur-sm safe-area-inset-bottom">
        {footer}
      </div>
    </div>
  );
} 