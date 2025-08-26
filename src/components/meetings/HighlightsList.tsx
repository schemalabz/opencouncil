import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { getHighlightsForMeeting, HighlightWithUtterances, upsertHighlight } from "@/lib/db/highlights";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Star, Plus, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

import { formatTime } from "@/lib/utils";
import { useHighlight } from "./HighlightContext";
import { HighlightDialog } from "./HighlightDialog";

interface HighlightCardProps {
  highlight: HighlightWithUtterances;
}

const HighlightCard = ({ highlight }: HighlightCardProps) => {
  const router = useRouter();
  const { calculateHighlightData } = useHighlight();
  const { subjects } = useCouncilMeetingData();
  
  const highlightData = calculateHighlightData(highlight);
  
  // Extract the statistics we need, with fallbacks
  const duration = highlightData?.statistics.duration || 0;
  const speakerCount = highlightData?.statistics.speakerCount || 0;
  const utteranceCount = highlightData?.statistics.utteranceCount || 0;

  const handleCardClick = () => {
    router.push(`/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`);
  };

  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer" 
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

const AddHighlightButton = ({ onAdd }: { onAdd: (newHighlight?: HighlightWithUtterances) => void }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { meeting } = useCouncilMeetingData();
  const router = useRouter();

  const handleCreateHighlight = async (name: string, subjectId?: string) => {
    try {
      const newHighlight = await upsertHighlight({
        name,
        meetingId: meeting.id,
        cityId: meeting.cityId,
        utteranceIds: [],
        subjectId
      });
      
      toast({
        title: "Success",
        description: "Highlight created successfully. Redirecting to edit mode...",
        variant: "default",
      });
      
      // Navigate directly to transcript page with editing mode for the new highlight
      router.push(`/${meeting.cityId}/${meeting.id}/transcript?highlight=${newHighlight.id}`);
      
      // Still call onAdd to update the list (though we're navigating away)
      onAdd(newHighlight);
    } catch (error) {
      console.error('Failed to create highlight:', error);
      toast({
        title: "Error",
        description: "Failed to create highlight. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 border-b">
      <Button className="w-full" size="lg" onClick={() => setIsDialogOpen(true)}>
        <Plus className="h-5 w-5 mr-2" />
        Create New Highlight
      </Button>
      
      <HighlightDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleCreateHighlight}
        mode="create"
      />
    </div>
  );
};

export default function HighlightsList({ highlights: initialHighlights }: { highlights: HighlightWithUtterances[] }) {
  const { meeting } = useCouncilMeetingData();
  const [highlights, setHighlights] = useState(initialHighlights);
  const [canEdit, setCanEdit] = useState(false);

  React.useEffect(() => {
    const checkAuth = async () => {
      const authorized = await isUserAuthorizedToEdit({ cityId: meeting.cityId });
      setCanEdit(authorized);
    };
    checkAuth();
  }, [meeting.cityId]);

  const reloadHighlights = React.useCallback(async (newHighlightToSelect?: HighlightWithUtterances) => {
    try {
      const updatedHighlights = await getHighlightsForMeeting(meeting.cityId, meeting.id);
      setHighlights(updatedHighlights);
    } catch (error) {
      console.error('Failed to reload highlights', error);
    }
  }, [meeting.cityId, meeting.id]);

  const handleAddHighlight = React.useCallback((newHighlight?: HighlightWithUtterances) => {
    reloadHighlights(newHighlight);
  }, [reloadHighlights]);

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
          <AddHighlightButton onAdd={handleAddHighlight} />
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
              <Clock className="w-5 h-5 mr-2 text-blue-500" />
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
                <AddHighlightButton onAdd={handleAddHighlight} />
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