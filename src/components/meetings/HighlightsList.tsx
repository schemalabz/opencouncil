"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import type { HighlightWithUtterances } from "@/lib/db/highlights";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Play, Loader2, Calendar, Tag, User } from "lucide-react";

import { formatTime, formatRelativeTime } from "@/lib/utils";
import { useHighlight } from "./HighlightContext";
import { CreateHighlightButton } from "./CreateHighlightButton";
import { useTranscriptOptions } from "./options/OptionsContext";

interface HighlightCardProps {
  highlight: HighlightWithUtterances;
}

const HighlightCard = ({ highlight }: HighlightCardProps) => {
  const router = useRouter();
  const locale = useLocale();
  const { calculateHighlightData } = useHighlight();
  const { subjects } = useCouncilMeetingData();
  const { options } = useTranscriptOptions();
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('highlights');
  
  const highlightData = calculateHighlightData(highlight);
  
  // Extract the statistics we need, with fallbacks
  const duration = highlightData?.statistics.duration || 0;
  const speakerCount = highlightData?.statistics.speakerCount || 0;
  const utteranceCount = highlightData?.statistics.utteranceCount || 0;
  
  // Only show creator for city editors (they can see all highlights)
  const canEditCity = options.editsAllowed;
  const creatorName = canEditCity ? highlight.createdBy?.name : null;

  const handleCardClick = () => {
    if (isLoading) return; // Prevent multiple clicks
    
    setIsLoading(true);
    try {
      router.push(`/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`);
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
                <h3 className="font-semibold text-lg truncate">{highlight.name}</h3>
                {highlight.isShowcased && (
                  <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                )}
                {isLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                )}
              </div>
              
              {/* Subject badge and creator info */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center space-x-2">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {highlight.subjectId ? (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {subjects.find(s => s.id === highlight.subjectId)?.name || t('common.connectedSubject')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t('common.noConnectedSubject')}
                    </Badge>
                  )}
                </div>
                
                {/* Creator info */}
                {creatorName && (
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{creatorName}</span>
                  </div>
                )}
              </div>
              
              {/* Stats row - compact and organized */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <div className="flex items-center space-x-1 bg-muted/30 px-2 py-1 rounded-md">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">{formatTime(duration)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{speakerCount}</span>
                  </div>
                  <span className="text-xs">
                    {utteranceCount} <span className="hidden sm:inline">{t('common.utterances')}</span>
                  </span>
                </div>
                
                {/* Updated timestamp - subtle but visible */}
                <div className="flex items-center space-x-1 text-xs text-muted-foreground/70">
                  <Calendar className="h-3 w-3" />
                  <span>{formatRelativeTime(highlight.updatedAt, locale)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AddHighlightButton = () => {
  const { editingHighlight } = useHighlight();
  const t = useTranslations('highlights');
  
  return (
    <div className="p-4 border-b">
      {editingHighlight && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2 text-sm text-amber-800">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">{t('highlightCard.currentlyEditing')}</span>
            <span className="font-semibold truncate">{editingHighlight.name}</span>
          </div>
          <p className="text-xs text-amber-700 mt-1 ml-6">
            {t('highlightCard.finishEditingDescription')}
          </p>
        </div>
      )}
      <CreateHighlightButton 
        variant="full" 
        size="lg"
      />
    </div>
  );
};

export default function HighlightsList() {
  const { highlights } = useCouncilMeetingData();
  const { options } = useTranscriptOptions();
  const canCreateHighlights = options.canCreateHighlights;
  const t = useTranslations('highlights');

  const showcasedHighlights = highlights.filter(h => h.isShowcased);
  const highlightsWithVideo = highlights.filter(h => h.videoUrl && !h.isShowcased);
  const draftHighlights = highlights.filter(h => !h.videoUrl && !h.isShowcased);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mb-3 text-center">
          {t('description')}
        </p>
      </div>

      {/* Create New Highlight Button */}
      {canCreateHighlights && highlights.length > 0 && (
        <div className="flex justify-center">
          <AddHighlightButton />
        </div>
      )}

      {/* Highlights Grid */}
      <div className="space-y-6">
        {/* Showcased Highlights */}
        {showcasedHighlights.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Star className="w-5 h-5 mr-2 text-yellow-500" />
              {t('sections.showcased')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {showcasedHighlights.map(highlight => (
                <HighlightCard
                  key={highlight.id}
                  highlight={highlight}
                />
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
              {highlightsWithVideo.map(highlight => (
                <HighlightCard
                  key={highlight.id}
                  highlight={highlight}
                />
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
              {draftHighlights.map(highlight => (
                <HighlightCard
                  key={highlight.id}
                  highlight={highlight}
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Empty State */}
        {highlights.length === 0 && (
          <div className="text-center py-12">
            <div className="text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('emptyState.title')}</h3>
              <p className="text-sm mb-4">
                {t('emptyState.description')}
              </p>
              {canCreateHighlights && <AddHighlightButton />}
            </div>
          </div>
        )}
        
        {/* No Draft Highlights State */}
        {highlights.length > 0 && draftHighlights.length === 0 && (
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
    </div>
  );
} 