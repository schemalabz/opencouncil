import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PersonBadge } from "../persons/PersonBadge";
import { SearchResult } from "@/lib/search/search";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Link } from "@/i18n/routing";
import { format } from "date-fns";

export function Result({ result, className }: { result: SearchResult, className?: string }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = timestamp % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
    };

    const borderColor = result.speakerSegment.party?.colorHex || '#D3D3D3';
    const timeParam = `t=${Math.floor(result.speakerSegment.startTimestamp)}`;
    const transcriptUrl = `/${result.city.id}/${result.councilMeeting.id}/transcript?${timeParam}`;

    return (
        <Card
            className={cn("hover:shadow-md transition-shadow", className)}
            style={{ borderLeft: `4px solid ${borderColor}` }}
        >
            <CardContent className="p-4 flex flex-col space-y-4">
                <div className="flex flex-col space-y-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <Link
                            href={`/${result.city.id}`}
                            className="text-sm text-muted-foreground hover:text-foreground"
                        >
                            {result.city.name}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Link
                                href={`/${result.city.id}/${result.councilMeeting.id}`}
                                className="hover:text-foreground"
                            >
                                {format(new Date(result.councilMeeting.dateTime), 'PPP')}
                            </Link>
                            <span>•</span>
                            <span>{formatTimestamp(result.speakerSegment.startTimestamp)}</span>
                        </div>
                    </div>

                    <PersonBadge
                        person={result.speakerSegment.person ? { ...result.speakerSegment.person, party: result.speakerSegment.party || null } : undefined}
                    />
                </div>

                <div className="w-full cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    {result.speakerSegment.summary && (
                        <div className="pl-4 border-l-2 border-muted mb-4">
                            <p className="text-muted-foreground">
                                {result.speakerSegment.summary.text}
                            </p>
                        </div>
                    )}
                    <p className={cn(
                        "text-sm text-gray-600 whitespace-pre-wrap",
                        !isExpanded && "line-clamp-3"
                    )}>
                        {result.speakerSegment.text}
                    </p>
                    {result.speakerSegment.text && result.speakerSegment.text.length > 200 && (
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