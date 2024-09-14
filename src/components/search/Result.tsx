import { SearchResult } from "@/lib/search/search";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import SpeakerBadge from "../SpeakerBadge";
import { format } from "date-fns";
import { el, enUS } from 'date-fns/locale';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Link } from '@/i18n/routing';
import PartyBadge from "../PartyBadge";
import { useLocale } from "next-intl";
import { useState } from 'react';

export function Result({ result, className }: { result: SearchResult; className?: string }) {
    const { city, councilMeeting, speakerSegment } = result;
    const locale = useLocale();
    const [isExpanded, setIsExpanded] = useState(false);

    const truncateText = (text: string, wordCount: number) => {
        const words = text.split(' ');
        if (words.length <= wordCount) return text;
        return words.slice(0, wordCount).join(' ') + '...';
    };

    const handleTextClick = () => {
        setIsExpanded(!isExpanded);
    };

    return (
        <Card className={className}>
            <CardHeader>
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link href={`/${city.id}`}>{city.name}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href={`/${city.id}/${councilMeeting.id}`}>{councilMeeting.name}</BreadcrumbLink>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
                <CardDescription className="flex flex-row justify-between items-center">
                    <span className="text-lg font-semibold">
                        {format(new Date(councilMeeting.dateTime), 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS })}
                    </span>
                    <Link className="text-muted-foreground" href={`/${city.id}/${councilMeeting.id}?t=${speakerSegment.startTimestamp}`}>
                        {format(new Date(speakerSegment.startTimestamp * 1000), "HH:mm:ss")}
                    </Link>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:space-x-4">
                        <div className="flex flex-col space-y-2">
                            <SpeakerBadge
                                speakerTag={{
                                    personId: speakerSegment.person?.id || null,
                                    label: speakerSegment.person?.name_short || "Unknown Speaker",
                                }}
                                person={speakerSegment.person}
                                party={speakerSegment.party}
                                withLeftBorder
                            />
                            {speakerSegment.party && (
                                <div className="inline-block">
                                    <PartyBadge party={speakerSegment.party} shortName />
                                </div>
                            )}
                        </div>
                        {speakerSegment.summary && (
                            <p className="text-sm text-gray-600 mt-2 md:mt-0">{speakerSegment.summary.text}</p>
                        )}
                    </div>
                    {speakerSegment.text && (
                        <Card className="bg-gray-100 p-2 cursor-pointer" onClick={handleTextClick}>
                            <p className="text-xs font-mono text-justify">
                                {isExpanded ? speakerSegment.text : truncateText(speakerSegment.text, 50)}
                            </p>
                            {speakerSegment.text.split(' ').length > 50 && (
                                <div className="text-right mt-2">
                                    <span className="text-xs text-gray-500">
                                        {isExpanded ? '▲' : '▼'}
                                    </span>
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}