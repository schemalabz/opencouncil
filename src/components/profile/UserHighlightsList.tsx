"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Star, Calendar, MapPin, Play } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

type UserHighlight = {
    id: string;
    name: string;
    cityId: string;
    meetingId: string;
    updatedAt: Date | string;
    isShowcased: boolean;
    videoUrl: string | null;
    highlightedUtterances: { utterance: { startTimestamp: number | null; endTimestamp: number | null } }[];
    meeting: { name: string; name_en: string; dateTime: Date | string };
};

interface UserHighlightsListProps {
    highlights: UserHighlight[];
}

export function UserHighlightsList({ highlights }: UserHighlightsListProps) {
    const router = useRouter();
    const locale = useLocale();
    const t = useTranslations("Profile");

    if (highlights.length === 0) {
        return (
            <div className="text-center py-12">
                <Star className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">{t("highlights.emptyTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                    {t("highlights.emptyDescription")}
                </p>
            </div>
        );
    }

    // Group highlights by city
    const groupedByCityId = new Map<string, { cityName: string; highlights: UserHighlight[] }>();
    for (const highlight of highlights) {
        const meetingName = locale === "el" ? highlight.meeting.name : highlight.meeting.name_en;
        if (!groupedByCityId.has(highlight.cityId)) {
            // Use the city name from the meeting context — we don't have it directly, so group by cityId
            groupedByCityId.set(highlight.cityId, { cityName: highlight.cityId, highlights: [] });
        }
        groupedByCityId.get(highlight.cityId)!.highlights.push(highlight);
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                {t("highlights.count", { count: highlights.length })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {highlights.map((highlight) => {
                    const meetingName = locale === "el" ? highlight.meeting.name : highlight.meeting.name_en;
                    const utteranceCount = highlight.highlightedUtterances.length;

                    return (
                        <Card
                            key={highlight.id}
                            className="hover:shadow-md transition-all cursor-pointer"
                            onClick={() =>
                                router.push(
                                    `/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`
                                )
                            }
                        >
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between">
                                    <h3 className="font-semibold text-lg truncate flex-1 min-w-0">
                                        {highlight.name}
                                    </h3>
                                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                        {highlight.isShowcased && (
                                            <Star className="h-4 w-4 text-yellow-500" />
                                        )}
                                        {highlight.videoUrl && (
                                            <Play className="h-4 w-4 text-green-500" />
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate">{meetingName}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            <span>
                                                {new Date(highlight.meeting.dateTime).toLocaleDateString(
                                                    locale === "el" ? "el-GR" : "en-US",
                                                    { year: "numeric", month: "short", day: "numeric" }
                                                )}
                                            </span>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">
                                            {utteranceCount} {utteranceCount === 1 ? "utterance" : "utterances"}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatRelativeTime(highlight.updatedAt, locale)}</span>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
