import { Badge } from "@/components/ui/badge";
import { CalendarDays, MessageSquare } from "lucide-react";
import { formatConsultationEndDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";

type ViewMode = 'map' | 'document';

interface ConsultationHeaderProps {
    title: string;
    description: string;
    endDate: Date;
    cityTimezone: string;
    isActive: boolean;
    isActiveComputed: boolean;
    commentCount?: number;
    currentView: ViewMode;
    onCommentsClick?: () => void;
}

export default function ConsultationHeader({
    title,
    description,
    endDate,
    cityTimezone,
    isActive,
    isActiveComputed,
    commentCount = 0,
    currentView,
    onCommentsClick
}: ConsultationHeaderProps) {
    const isMapView = currentView === 'map';
    if (isMapView) {
        // Minimal floating header for map view
        return (
            <div className="absolute top-0 left-0 right-0 z-40 p-4 md:p-6 pointer-events-none">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-md md:text-lg font-bold text-black drop-shadow-lg shadow-white/80 [text-shadow:_2px_2px_4px_rgb(255_255_255_/_80%)]">
                        {title}
                    </h1>
                </div>
            </div>
        );
    }

    // Full header for document view
    return (
        <div className="bg-background border-b border-border p-3 md:p-6 z-30 relative">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4 mb-3 md:mb-4">
                    <div className="flex-1">
                        <h1 className="text-lg md:text-2xl font-bold mb-1 md:mb-2 leading-tight">
                            {title}
                        </h1>
                        <p className="text-xs md:text-base text-muted-foreground">
                            {description}
                        </p>
                    </div>
                    <Badge
                        variant={isActiveComputed ? "default" : "secondary"}
                        className="shrink-0 self-start text-xs"
                    >
                        {isActiveComputed ? "Ενεργή" : "Ανενεργή"}
                    </Badge>
                </div>

                <div className="flex flex-wrap gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 md:h-4 md:w-4" />
                        <span>
                            {isActiveComputed ? "Λήγει:" : "Έληξε:"} {formatConsultationEndDate(endDate, cityTimezone)}
                        </span>
                    </div>
                    {onCommentsClick && commentCount > 0 ? (
                        <Button
                            onClick={onCommentsClick}
                            variant="secondary"
                            size="sm"
                            className="text-xs md:text-sm bg-orange hover:bg-orange/90 text-white border-orange transition-colors"
                            title="Δείτε όλα τα σχόλια"
                        >
                            <MessageSquare className="h-3 w-3 md:h-4 md:w-4 mr-1.5" />
                            <span>{commentCount} σχόλια</span>
                        </Button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 md:h-4 md:w-4" />
                            <span>{commentCount} σχόλια</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
} 