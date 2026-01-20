"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuideButtonProps {
  storageKey: string;
  DialogComponent: React.ComponentType<{
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  label: string;
  hintTitle: string;
  hintDescription: string;
  ringClassName?: string;
  iconClassName?: string;
}

export function GuideButton({
  storageKey,
  DialogComponent,
  label,
  hintTitle,
  hintDescription,
  ringClassName = "ring-2 ring-blue-500 ring-offset-2 bg-blue-50 animate-pulse",
  iconClassName,
}: GuideButtonProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const hasSeenGuide = localStorage.getItem(storageKey);
    if (!hasSeenGuide) {
      const timer = setTimeout(() => setShowHint(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const dismissHint = () => {
    setShowHint(false);
    localStorage.setItem(storageKey, "true");
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      dismissHint();
    }
  };

  return (
    <Tooltip open={showHint}>
      <DialogComponent onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("flex items-center space-x-1", showHint ? ringClassName : "")}
          >
            <BookOpen className={cn("h-4 w-4", iconClassName)} />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        </TooltipTrigger>
      </DialogComponent>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="font-semibold">{hintTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{hintDescription}</p>
      </TooltipContent>
    </Tooltip>
  );
}


