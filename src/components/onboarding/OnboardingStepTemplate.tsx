import React from 'react';

interface OnboardingStepTemplateProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export function OnboardingStepTemplate({ title, description, children, footer }: OnboardingStepTemplateProps) {
  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto bg-white pt-6">
      {/* Header section */}
      <div className="flex-none px-6 md:px-8">
        <h2 className="text-xl font-bold mb-1 text-primary">{title}</h2>
        {description && <div className="text-muted-foreground mt-6">{description}</div>}
      </div>

      {/* Scrollable content section */}
      <div className="flex-1 overflow-y-auto p-4 px-6 md:px-8">
        {children}
      </div>

      {/* Sticky footer section */}
      <div className="flex-none border-t bg-white/95 backdrop-blur-sm">
        {footer}
      </div>
    </div>
  );
} 