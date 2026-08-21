"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Play, Loader2, Calendar, Tag, User } from "lucide-react";
import { formatTime, formatRelativeTime } from "@/lib/utils";
import { DownloadHighlightButton } from "./DownloadHighlightButton";

// Presentational card/grid shared by the meeting highlights page and the
// personal highlights page. Data arrives via props: the meeting page maps
// from its React contexts (see src/components/meetings/HighlightsList.tsx),
// the personal page maps from the DB payload on the server.
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
  /** Renders a download button on the card when the highlight has a video. */
  download?: { videoUrl: string; fileName: string };
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

            {data.download && (
              <div className="ml-3 flex-shrink-0">
                <DownloadHighlightButton
                  videoUrl={data.download.videoUrl}
                  fileName={data.download.fileName}
                  showLabel={false}
                  size="icon"
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HighlightsGrid({
  items,
  createButton,
  grouped = true,
  emptyState,
}: {
  items: HighlightCardData[];
  createButton?: React.ReactNode;
  /**
   * Group into showcased/video/draft sections (the meeting page). The
   * personal highlights page passes false: it already groups by meeting,
   * so per-status sections inside each meeting would fragment the list.
   */
  grouped?: boolean;
  /** Overrides the default "create your first highlight" empty state (the personal page). */
  emptyState?: { title: string; description: string };
}) {
  const t = useTranslations('highlights');

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">{emptyState?.title ?? t('emptyState.title')}</h3>
          <p className="text-sm mb-4">
            {emptyState?.description ?? t('emptyState.description')}
          </p>
          {createButton}
        </div>
      </div>
    );
  }

  if (!grouped) {
    return (
      <div className="space-y-6">
        {createButton && (
          <div className="flex justify-center">
            {createButton}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(item => (
            <HighlightCard key={item.id} data={item} />
          ))}
        </div>
      </div>
    );
  }

  const showcasedHighlights = items.filter(h => h.isShowcased);
  const highlightsWithVideo = items.filter(h => h.hasVideo && !h.isShowcased);
  const draftHighlights = items.filter(h => !h.hasVideo && !h.isShowcased);

  return (
    <div className="space-y-6">
      {/* Create New Highlight Button */}
      {createButton && (
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

      {/* No Draft Highlights State — only meaningful next to the draft section above */}
      {draftHighlights.length === 0 && (
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
