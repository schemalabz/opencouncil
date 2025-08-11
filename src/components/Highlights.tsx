import React, { useState } from "react";
import { useCouncilMeetingData } from "./meetings/CouncilMeetingDataContext";
import { getHighlightsForMeeting, HighlightWithUtterances, deleteHighlight, upsertHighlight, toggleHighlightShowcase } from "@/lib/db/highlights";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Star, Edit, Trash, Download, Plus, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { requestSplitMediaFileForHighlight } from "@/lib/tasks/splitMediaFile";
import { HighlightVideo } from '@/components/meetings/HighlightVideo';
import { formatTime } from "@/lib/utils";
import { HighlightPreview } from "./meetings/HighlightPreview";
import { useHighlight } from "./meetings/HighlightContext";
import { HighlightDialog } from "./meetings/HighlightDialog";

interface HighlightListItemProps {
  highlight: HighlightWithUtterances;
  isSelected: boolean;
  onSelect: () => void;
}

const HighlightListItem = ({ 
  highlight, 
  isSelected, 
  onSelect, 
}: HighlightListItemProps) => {
  const { calculateHighlightData } = useHighlight();
  const highlightData = calculateHighlightData(highlight);
  
  // Extract the statistics we need, with fallbacks
  const duration = highlightData?.statistics.duration || 0;
  const speakerCount = highlightData?.statistics.speakerCount || 0;
  const utteranceCount = highlightData?.statistics.utteranceCount || 0;

  return (
    <div 
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected 
          ? 'bg-primary/10 border border-primary/30' 
          : 'hover:bg-muted/50 border border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="font-medium text-sm truncate">{highlight.name}</h4>
            {highlight.isShowcased && (
              <Star className="h-3 w-3 text-yellow-500" />
            )}
          </div>
          <div className="flex items-center space-x-3 text-xs text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>{formatTime(duration)}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Users className="h-3 w-3" />
              <span>{speakerCount}</span>
            </div>
            <span>{utteranceCount} utterances</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddHighlightButton = ({ onAdd }: { onAdd: (newHighlight?: HighlightWithUtterances) => void }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { meeting } = useCouncilMeetingData();

  const handleCreateHighlight = async (name: string, subjectId?: string) => {
    try {
      const newHighlight = await upsertHighlight({
        name,
        meetingId: meeting.id,
        cityId: meeting.cityId,
        utteranceIds: []
      });
      
      // Show success toast
      toast({
        title: "Success",
        description: "Highlight created successfully.",
        variant: "default",
      });
      
      // Pass the new highlight to the parent component
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
        Add Highlight
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

const HighlightPreviewPanel = ({ 
  highlight, 
  canEdit, 
  onHighlightsUpdate 
}: { 
  highlight: HighlightWithUtterances | null;
  canEdit: boolean;
  onHighlightsUpdate: () => void;
}) => {
  const { setEditingHighlight, calculateHighlightData } = useHighlight();
  const { subjects } = useCouncilMeetingData();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const highlightData = calculateHighlightData(highlight);

  if (!highlight) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Select a highlight to preview</p>
          <p className="text-sm mt-1 text-muted-foreground">
            Choose a highlight from the list to see its content and manage it
          </p>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    setEditingHighlight(highlight);
  };

  const handleEditDetails = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (name: string, subjectId?: string) => {
    if (!highlight) return;
    
    try {
      await upsertHighlight({
        id: highlight.id,
        name,
        meetingId: highlight.meetingId,
        cityId: highlight.cityId,
        utteranceIds: highlight.highlightedUtterances.map(hu => hu.utteranceId),
        subjectId: subjectId || null // Pass subjectId to upsertHighlight
      });
      
      // Show success toast
      toast({
        title: "Success",
        description: "Highlight updated successfully.",
        variant: "default",
      });
      
      onHighlightsUpdate();
    } catch (error) {
      console.error('Failed to update highlight:', error);
      toast({
        title: "Error",
        description: "Failed to update highlight. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHighlight(highlight.id);
      onHighlightsUpdate();
      toast({
        title: "Success",
        description: "Highlight deleted successfully.",
        variant: "default",
      });
    } catch (error) {
      console.error('Failed to delete highlight:', error);
      toast({
        title: "Error",
        description: "Failed to delete highlight. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateVideo = async () => {
    try {
      await requestSplitMediaFileForHighlight(highlight.id);
      toast({
        title: "Success",
        description: "Video generation started. This may take a few minutes.",
        variant: "default",
      });
      // Poll for updates or handle completion notification separately
    } catch (error) {
      console.error('Failed to generate video:', error);
      toast({
        title: "Error",
        description: "Failed to generate video. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleShowcase = async () => {
    try {
      await toggleHighlightShowcase(highlight.id);
      onHighlightsUpdate();
      toast({
        title: "Success",
        description: highlight.isShowcased ? "Highlight removed from showcase." : "Highlight added to showcase.",
        variant: "default",
      });
    } catch (error) {
      console.error('Failed to toggle showcase:', error);
      toast({
        title: "Error",
        description: "Failed to toggle showcase status. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold">{highlight.name}</h3>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 hover:bg-muted"
                onClick={handleEditDetails}
              >
                <Edit className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center space-x-2 mt-1">
            {highlight.isShowcased && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Showcased
              </Badge>
            )}
            {highlight.subjectId ? (
              <div className="flex items-center space-x-1">
                <Badge variant="outline" className="text-xs">
                  {subjects.find(s => s.id === highlight.subjectId)?.name}
                </Badge>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 hover:bg-muted"
                    onClick={handleEditDetails}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  No subject
                </Badge>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 hover:bg-muted"
                    onClick={handleEditDetails}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
            {highlightData && (
              <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                <div className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatTime(highlightData.statistics.duration)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{highlightData.statistics.speakerCount} speakers</span>
                </div>
                <span>{highlightData.statistics.utteranceCount} utterances</span>
              </div>
            )}
          </div>
        </div>
        
        {canEdit && (
          <div className="flex items-center space-x-2">
            <Button size="sm" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Content
            </Button>
            {highlight.muxPlaybackId && (
              <Button
                size="sm" 
                variant="outline"
                onClick={handleToggleShowcase}
                className={highlight.isShowcased ? "text-yellow-500" : ""}
              >
                <Star className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleDelete}>
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="border rounded-lg p-4">
        <HighlightPreview 
          highlightUtterances={highlightData?.highlightUtterances}
          title="Content Preview"
          maxHeight="max-h-48"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        {highlight.videoUrl ? (
          <a
            href={highlight.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Video
            </Button>
          </a>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateVideo}
          >
            Generate Video
          </Button>
        )}
      </div>

      {/* Video Player */}
      {highlight.muxPlaybackId && (
        <div className="mt-4">
          <HighlightVideo
            id={highlight.id}
            title={highlight.name}
            playbackId={highlight.muxPlaybackId}
          />
        </div>
      )}

      {/* Edit Dialog */}
      <HighlightDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        highlight={highlight}
        onSave={handleSaveEdit}
        mode="edit"
      />
    </div>
  );
};

export default function Highlights({ highlights: initialHighlights }: { highlights: HighlightWithUtterances[] }) {
  const { meeting } = useCouncilMeetingData();
  const [highlights, setHighlights] = useState(initialHighlights);
  const [selectedHighlight, setSelectedHighlight] = useState<HighlightWithUtterances | null>(null);
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
      
      // If we have a new highlight to select, find and select it
      if (newHighlightToSelect) {
        const updatedHighlight = updatedHighlights.find(h => h.id === newHighlightToSelect.id);
        if (updatedHighlight) {
          setSelectedHighlight(updatedHighlight);
          return; // Don't run the normal selection logic
        }
      }
      
      // Preserve the selected highlight if it still exists in the updated list
      if (selectedHighlight) {
        const updatedHighlight = updatedHighlights.find(h => h.id === selectedHighlight.id);
        if (updatedHighlight) {
          setSelectedHighlight(updatedHighlight);
        } else {
          setSelectedHighlight(null);
        }
      }
    } catch (error) {
      console.error('Failed to reload highlights', error);
    }
  }, [meeting.cityId, meeting.id, selectedHighlight]);

  const handleAddHighlight = React.useCallback((newHighlight?: HighlightWithUtterances) => {
    reloadHighlights(newHighlight);
  }, [reloadHighlights]);

  const handleHighlightSelect = (highlight: HighlightWithUtterances) => {
    setSelectedHighlight(highlight);
  };

  const showcasedHighlights = highlights.filter(h => h.isShowcased);
  const regularHighlights = highlights.filter(h => !h.isShowcased);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Meeting Highlights</h2>
        <p className="text-sm text-muted-foreground mb-3 text-center">
          Create and manage video highlights from this meeting. Select a highlight to preview its content, 
          or create a new one.
        </p>
      </div>

      {/* Two-Panel Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Preview Panel - Top on mobile, right on desktop */}
        <div className="xl:col-span-3 order-1 xl:order-2">
          <Card>
            <CardContent className="p-6">
              <HighlightPreviewPanel
                highlight={selectedHighlight}
                canEdit={canEdit}
                onHighlightsUpdate={reloadHighlights}
              />
            </CardContent>
          </Card>
        </div>

        {/* Left Panel - Highlight List - Bottom on mobile, left on desktop */}
        <div className="xl:col-span-1 order-2 xl:order-1">
          <Card className="h-[calc(100vh-12rem)]">
            <CardContent className="p-0 h-full flex flex-col">
              {canEdit && <AddHighlightButton onAdd={handleAddHighlight} />}
              
              <div className="flex-1 overflow-y-auto">
                {showcasedHighlights.length > 0 && (
                  <div className="p-3 border-b">
                    <h3 className="text-sm font-medium mb-2 flex items-center">
                      <Star className="w-4 h-4 mr-2 text-yellow-500" />
                      Showcased
                    </h3>
                    <div className="space-y-1">
                      {showcasedHighlights.map(highlight => (
                        <HighlightListItem
                          key={highlight.id}
                          highlight={highlight}
                          isSelected={selectedHighlight?.id === highlight.id}
                          onSelect={() => handleHighlightSelect(highlight)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {regularHighlights.length > 0 && (
                  <div className="p-3">
                    <h3 className="text-sm font-medium mb-2">All Highlights</h3>
                    <div className="space-y-1">
                      {regularHighlights.map(highlight => (
                        <HighlightListItem
                          key={highlight.id}
                          highlight={highlight}
                          isSelected={selectedHighlight?.id === highlight.id}
                          onSelect={() => handleHighlightSelect(highlight)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {highlights.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground">
                    <p>No highlights available</p>
                    {canEdit && <p className="text-sm mt-1">Create your first highlight above</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}