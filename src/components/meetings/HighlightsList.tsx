"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import type { HighlightWithUtterances } from "@/lib/db/highlights";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Play, Loader2 } from "lucide-react";

import { formatTime } from "@/lib/utils";
import { useHighlight } from "./HighlightContext";
import { CreateHighlightButton } from "./CreateHighlightButton";
import { useTranscriptOptions } from "./options/OptionsContext";

interface HighlightCardProps {
  highlight: HighlightWithUtterances;
}

const HighlightCard = ({ highlight }: HighlightCardProps) => {
  const router = useRouter();
  const { calculateHighlightData } = useHighlight();
  const { subjects } = useCouncilMeetingData();
  const [isLoading, setIsLoading] = useState(false);
  
  const highlightData = calculateHighlightData(highlight);
  
  // Extract the statistics we need, with fallbacks
  const duration = highlightData?.statistics.duration || 0;
  const speakerCount = highlightData?.statistics.speakerCount || 0;
  const utteranceCount = highlightData?.statistics.utteranceCount || 0;

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
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="font-semibold text-lg truncate">{highlight.name}</h3>
                {highlight.isShowcased && (
                  <Star className="h-4 w-4 text-yellow-500" />
                )}
                {isLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              
              {/* Subject and Stats */}
              <div className="flex items-center space-x-3 mb-3">
                {highlight.subjectId ? (
                  <Badge variant="outline" className="text-xs">
                    {subjects.find(s => s.id === highlight.subjectId)?.name || 'Subject connected'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    No subject
                  </Badge>
                )}
                
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{speakerCount} speakers</span>
                  </div>
                  <span>{utteranceCount} utterances</span>
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
  return (
    <div className="p-4 border-b">
      <CreateHighlightButton 
        variant="full" 
        size="lg"
      />
    </div>
  );
};

export default function HighlightsList() {
  const { meeting, highlights } = useCouncilMeetingData();
  const { options } = useTranscriptOptions();
  const canEdit = options.editsAllowed;

  const showcasedHighlights = highlights.filter(h => h.isShowcased);
  const highlightsWithVideo = highlights.filter(h => h.videoUrl && !h.isShowcased);
  const draftHighlights = highlights.filter(h => !h.videoUrl && !h.isShowcased);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Meeting Highlights</h2>
        <p className="text-sm text-muted-foreground mb-3 text-center">
          Create and manage video highlights from this meeting. Click on a highlight to view its details, 
          or create a new one to get started.
        </p>
      </div>

      {/* Create New Highlight Button */}
      {canEdit && (
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
              Showcased Highlights
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
              Video Highlights
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
              Draft Highlights
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
              <h3 className="text-lg font-semibold mb-2">No highlights yet</h3>
              <p className="text-sm mb-4">
                Create your first highlight to start organizing meeting moments
              </p>
              {canEdit && (
                <AddHighlightButton />
              )}
            </div>
          </div>
        )}
        
        {/* No Draft Highlights State */}
        {highlights.length > 0 && draftHighlights.length === 0 && (
          <div className="text-center py-8">
            <div className="text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                All highlights have been processed into videos
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 