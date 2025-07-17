import { Card, CardContent } from "@/components/ui/card";
import { cn, getPartyFromRoles } from "@/lib/utils";
import { PersonBadge } from "../persons/PersonBadge";
import { SegmentWithRelations } from "@/lib/db/speakerSegments";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Link } from "@/i18n/routing";
import { format } from "date-fns";
import { useLocale } from "next-intl";
import { el, enUS } from "date-fns/locale";

export function Result({ result, className }: { result: SegmentWithRelations, className?: string }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const locale = useLocale();

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = timestamp % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
    };

    // Use roles-based party determination (same logic as PersonBadge)
    const party = result.person ? getPartyFromRoles(result.person.roles) : null;
    const borderColor = party?.colorHex || '#D3D3D3';
    const timeParam = `t=${Math.floor(result.startTimestamp)}`;
    const transcriptUrl = `/${result.meeting.city.id}/${result.meeting.id}/transcript?${timeParam}`;

    return (
        <Card
            className={cn("hover:shadow-md transition-shadow", className)}
            style={{ borderLeft: `4px solid ${borderColor}` }}
        >
            <CardContent className="p-4 flex flex-col space-y-4">
                <div className="flex flex-col space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <Link
                            href={`/${result.meeting.city.id}`}
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            {result.meeting.city.name}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Link
                                href={`/${result.meeting.city.id}/${result.meeting.id}`}
                                className="hover:text-foreground"
                            >
                                {format(new Date(result.meeting.dateTime), 'PPP', { locale: locale === 'el' ? el : enUS })}
                            </Link>
                            <span>•</span>
                            <span>{formatTimestamp(result.startTimestamp)}</span>
                        </div>
                    </div>

                    <PersonBadge
                        person={result.person || undefined}
                    />
                </div>

                <div className="w-full cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    {result.summary && (
                        <div className="pl-4 border-l-2 border-muted mb-4">
                            <p className="text-muted-foreground">
                                {result.summary.text}
                            </p>
                        </div>
                    )}
                    <p className={cn(
                        "text-sm text-gray-600 whitespace-pre-wrap",
                        !isExpanded && "line-clamp-3"
                    )}>
                        {result.text}
                    </p>
                    {result.text.length > 200 && (
                        <button
                            className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded)
                            }}
                        >
                            {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                    >
                        <Link href={transcriptUrl}>
                            <FileText className="h-4 w-4 mr-2" />
                            Απομαγνητοφώνηση
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}