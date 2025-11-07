"use client";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface BadgeWithExplanationProps {
    label: string;
    explanation: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
}

export function BadgeWithExplanation({
    label,
    explanation,
    variant = "default",
    className = ""
}: BadgeWithExplanationProps) {
    return (
        <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
                <div>
                    <Badge variant={variant} className={`cursor-help ${className}`}>
                        {label}
                    </Badge>
                </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="top">
                <p className="text-sm leading-relaxed">{explanation}</p>
            </HoverCardContent>
        </HoverCard>
    );
}

