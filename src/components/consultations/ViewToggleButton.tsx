"use client";

import { Map, FileText } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ViewMode = 'map' | 'document';

interface ViewToggleButtonProps {
    currentView: ViewMode;
    onToggle: () => void;
    drawerOpen?: boolean;
}

export default function ViewToggleButton({ currentView, onToggle, drawerOpen }: ViewToggleButtonProps) {
    const isMapView = currentView === 'map';

    return (
        <div className={cn(
            "fixed right-4 md:right-6 z-50 transition-all duration-300",
            drawerOpen ? "bottom-[45vh] md:bottom-6" : "bottom-4 md:bottom-6"
        )}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onToggle}
                            className="h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center p-0 border-0"
                            style={{
                                backgroundColor: 'hsl(24, 100%, 50%)',
                                color: 'white',
                            }}
                        >
                            {isMapView ? (
                                <FileText size={20} className="md:hidden" color="white" />
                            ) : (
                                <Map size={20} className="md:hidden" color="white" />
                            )}
                            {isMapView ? (
                                <FileText size={24} className="hidden md:block" color="white" />
                            ) : (
                                <Map size={24} className="hidden md:block" color="white" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        <p>{isMapView ? "Προβολή κειμένου" : "Προβολή χάρτη"}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
} 