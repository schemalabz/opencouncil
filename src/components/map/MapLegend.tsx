'use client';

import { useState } from 'react';
import { cn } from "@/lib/utils";
import { Info, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface MapLegendProps {
    className?: string;
    onShowExplainer?: () => void;
}

export function MapLegend({ className, onShowExplainer }: MapLegendProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className={cn(
            "fixed bottom-20 left-6 z-30 pointer-events-none hidden md:block transition-all duration-300 ease-in-out",
            isExpanded ? "w-[210px]" : "w-[100px]",
            className
        )}>
            <div className="bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-lg pointer-events-auto overflow-hidden">
                {/* Header / Toggle Button */}
                <div className="flex items-center border-b border-border/5">
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex-1 px-2.5 py-1.5 flex items-center justify-between hover:bg-accent/50 transition-colors"
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Info className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className={cn(
                                "text-[9px] font-bold text-foreground uppercase tracking-wider truncate",
                                !isExpanded && "hidden"
                            )}>Υπομνημα</span>
                            {!isExpanded && <span className="text-[8px] font-bold text-foreground uppercase tracking-tighter">ΥΠΟΜΝΗΜΑ</span>}
                        </div>
                        {isExpanded ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" /> : <ChevronUp className="w-2.5 h-2.5 text-muted-foreground" />}
                    </button>
                    
                    {/* Integrated "What is this" small button */}
                    <div className={cn("px-1 border-l border-border/5", !isExpanded && "hidden")}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onShowExplainer?.();
                            }}
                            className="p-1 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-primary"
                            title="Τι είναι αυτό;"
                        >
                            <HelpCircle className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Collapsible Content */}
                <div className={cn(
                    "transition-all duration-300 ease-in-out",
                    isExpanded ? "max-h-40 p-2.5 opacity-100" : "max-h-0 p-0 opacity-0"
                )}>
                    <div className="grid grid-cols-2 gap-3 items-start w-full">
                        
                        {/* Column 1: Demand Heatmap */}
                        <div className="space-y-1">
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tight">Ζητηση</p>
                            <div className="h-1 w-full rounded-full bg-gradient-to-r from-blue-100 to-blue-600 border border-blue-200/20" />
                            <div className="flex justify-between text-[6.5px] text-muted-foreground font-bold">
                                <span>Χαμηλή</span>
                                <span>Υψηλή</span>
                            </div>
                            <div className="flex items-center gap-1 pt-0.5">
                                <div className="relative w-1.5 h-1.5">
                                    <div className="absolute inset-0 rounded-full bg-blue-500 animate-pulse" />
                                </div>
                                <span className="text-[6.5px] text-blue-600 font-bold uppercase italic animate-pulse whitespace-nowrap">Κινητοποίηση</span>
                            </div>
                        </div>

                        {/* Column 2: Status & Recency */}
                        <div className="space-y-2">
                            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tight">Κατάσταση</p>
                            
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full border border-[hsl(24,100%,50%)] bg-[hsl(24,100%,92%)] flex-shrink-0" />
                                <span className="text-[7px] font-bold text-foreground uppercase leading-none">Υποστηριζομενος</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center -space-x-1 flex-shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-primary z-10 shadow-sm" />
                                    <div className="w-2 h-2 rounded-full bg-primary/20" />
                                </div>
                                <span className="text-[7px] font-bold text-foreground uppercase leading-none">Νεα vs Παλαια</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
