"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Play, Loader2, Calendar, Tag, User, FileText } from "lucide-react";
import { formatTime, formatRelativeTime } from "@/lib/utils";

// Presentational card/grid shared by the meeting highlights page and the
// admin highlights library. Data arrives via props: the meeting page maps
// from its React contexts (see src/components/meetings/HighlightsList.tsx),
// the admin page maps from the DB payload on the server.
export interface HighlightCardData {
  id: string;
  name: string;
  isShowcased: boolean;
  hasVideo: boolean;
  updatedAt: Date;
  /** Destination of the card click (the highlight detail view). */
  href: string;
  duration: number;
  speakerCount: number;
  utteranceCount: number;
  /** Label of the connected subject; null renders the "no subject" badge. */
  subjectName: string | null;
  creatorName: string | null;
  /** Library page only: which meeting the highlight belongs to. */
  meetingLabel?: string;
}

export function HighlightCard({ data }: { data: HighlightCardData }) {
  const router = useRouter();
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('highlights');

  const handleCardClick = () => {
    if (isLoading) return; // Prevent multiple clicks

    setIsLoading(true);
    try {
      router.push(data.href);
    } catch (error) {
      console.error('Navigation error:', error);
      setIsLoading(false);
    }
  };

  return (
    <Card
      className={`hover:shadow-md transition-all cursor-pointer ${
        isLoading ? 'opacity-75 pointer-events-none' : ''
      }`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header with title and status */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-3">
                <h3 className="font-semibold text-lg truncate">{data.name}</h3>
                {data.isShowcased && (
                  <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                )}
                {isLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {/* Subject badge, meeting and creator info */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {data.subjectName ? (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {data.subjectName}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t('common.noConnectedSubject')}
                    </Badge>
                  )}
                </div>

                {/* Meeting info (library page only) */}
                {data.meetingLabel && (
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    <span className="truncate">{data.meetingLabel}</span>
                  </div>
                )}

                {/* Creator info */}
                {data.creatorName && (
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{data.creatorName}</span>
                  </div>
                )}
              </div>

              {/* Stats row - compact and organized */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="flex items-center space-x-1 bg-muted/30 px-2 py-1 rounded-md">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">{formatTime(data.duration)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{data.speakerCount}</span>
                  </div>
                  <span className="text-xs">
                    {data.utteranceCount} <span className="hidden sm:inline">{t('common.utterances')}</span>
                  </span>
                </div>

                {/* Updated timestamp - subtle but visible */}
                <div className="flex items-center space-x-1 text-xs text-muted-foreground/70">
                  <Calendar className="h-3 w-3" />
                  <span>{formatRelativeTime(data.updatedAt, locale)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HighlightsGrid({ items, createButton }: { items: HighlightCardData[]; createButton?: React.ReactNode }) {
  const t = useTranslations('highlights');

  const showcasedHighlights = items.filter(h => h.isShowcased);
  const highlightsWithVideo = items.filter(h => h.hasVideo && !h.isShowcased);
  const draftHighlights = items.filter(h => !h.hasVideo && !h.isShowcased);

  return (
    <div className="space-y-6">
      {/* Create New Highlight Button */}
      {createButton && items.length > 0 && (
        <div className="flex justify-center">
          {createButton}
        </div>
      )}

      {/* Showcased Highlights */}
      {showcasedHighlights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Star className="w-5 h-5 mr-2 text-yellow-500" />
            {t('sections.showcased')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {showcasedHighlights.map(item => (
              <HighlightCard key={item.id} data={item} />
            ))}
          </div>
        </div>
      )}

      {/* Highlights with Video */}
      {highlightsWithVideo.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Play className="w-5 h-5 mr-2 text-green-500" />
            {t('sections.video')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {highlightsWithVideo.map(item => (
              <HighlightCard key={item.id} data={item} />
            ))}
          </div>
        </div>
      )}

      {/* Draft Highlights */}
      {draftHighlights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-blue-500" />
            {t('sections.draft')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draftHighlights.map(item => (
              <HighlightCard key={item.id} data={item} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{t('emptyState.title')}</h3>
            <p className="text-sm mb-4">
              {t('emptyState.description')}
            </p>
            {createButton}
          </div>
        </div>
      )}

      {/* No Draft Highlights State */}
      {items.length > 0 && draftHighlights.length === 0 && (
        <div className="text-center py-8">
          <div className="text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {t('highlightCard.allHighlightsProcessed')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
