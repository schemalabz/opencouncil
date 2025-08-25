"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { HighlightWithUtterances, deleteHighlight, upsertHighlight, toggleHighlightShowcase } from "@/lib/db/highlights";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Star, Edit, Trash, Download, Plus, ArrowLeft, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { requestGenerateHighlight } from "@/lib/tasks/generateHighlight";
import { HighlightVideo } from './HighlightVideo';
import { formatTime } from "@/lib/utils";
import { HighlightPreview } from "./HighlightPreview";
import { HighlightDialog } from "./HighlightDialog";
import { useHighlight } from "./HighlightContext";
import { getGenerateHighlightTasksForHighlight } from '@/lib/db/tasks';

interface HighlightViewProps {
  highlight: HighlightWithUtterances;
}

export function HighlightView({ highlight }: HighlightViewProps) {
  const router = useRouter();
  const { meeting, subjects } = useCouncilMeetingData();
  const { calculateHighlightData } = useHighlight();
  const [canEdit, setCanEdit] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [latestPendingTask, setLatestPendingTask] = useState<string | null>(null);

  const highlightData = calculateHighlightData(highlight);

  React.useEffect(() => {
    const checkAuth = async () => {
      const authorized = await isUserAuthorizedToEdit({ cityId: meeting.cityId });
      setCanEdit(authorized);
    };
    checkAuth();
  }, [meeting.cityId]);

  const fetchTaskStatuses = React.useCallback(async () => {
    try {
      const t = await getGenerateHighlightTasksForHighlight(meeting.cityId, meeting.id, highlight.id);
      if (t.length > 0) {
        const latest = t[0];
        if (latest.status === 'pending') {
          setLatestPendingTask(latest.id);
        } else if (latest.status === 'succeeded' && !highlight.muxPlaybackId) {
          const justCompleted = Date.now() - new Date(latest.updatedAt).getTime() < 6000; // ~2 polling intervals
          if (justCompleted) {
            // Clear the pending task state so the banner disappears
            setLatestPendingTask(null);
            router.refresh();
          }
        } else if (latest.status === 'succeeded' || latest.status === 'failed') {
          // Clear pending state for any completed task (success or failure)
          setLatestPendingTask(null);
        }
      } else {
        setLatestPendingTask(null);
      }
    } catch (error) {
      console.error('Error fetching task statuses:', error);
    }
  }, [meeting.cityId, meeting.id, highlight.id, highlight.muxPlaybackId, router]);

  React.useEffect(() => {
    fetchTaskStatuses();
  }, [fetchTaskStatuses]);

  React.useEffect(() => {
    if (!latestPendingTask) return;
    const id = setInterval(fetchTaskStatuses, 3000);
    return () => clearInterval(id);
  }, [latestPendingTask, fetchTaskStatuses]);

  const handleEditContent = () => {
    // Navigate to transcript page with highlight editing mode
    router.push(`/${meeting.cityId}/${meeting.id}/transcript?highlight=${highlight.id}`);
  };

  const handleEditDetails = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (name: string, subjectId?: string) => {
    try {
      await upsertHighlight({
        id: highlight.id,
        name,
        meetingId: highlight.meetingId,
        cityId: highlight.cityId,
        utteranceIds: highlight.highlightedUtterances.map(hu => hu.utteranceId),
        subjectId: subjectId || null
      });
      
      toast({
        title: "Success",
        description: "Highlight updated successfully.",
        variant: "default",
      });
      
      // Refresh the page to show updated data
      router.refresh();
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
    if (!confirm('Are you sure you want to delete this highlight?')) {
      return;
    }

    try {
      await deleteHighlight(highlight.id);
      toast({
        title: "Success",
        description: "Highlight deleted successfully.",
        variant: "default",
      });
      // Navigate back to highlights list
      router.push(`/${meeting.cityId}/${meeting.id}/highlights`);
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
      const task = await requestGenerateHighlight(highlight.id);
      toast({
        title: "Success",
        description: "Video generation started. This may take a few minutes.",
        variant: "default",
      });
      // Optimistically show the new task and start polling
      setLatestPendingTask(task.id);
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
      toast({
        title: "Success",
        description: highlight.isShowcased ? "Highlight removed from showcase." : "Highlight added to showcase.",
        variant: "default",
      });
      // Refresh the page to show updated status
      router.refresh();
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
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${meeting.cityId}/${meeting.id}/highlights`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Highlights
        </Button>
      </div>

      {/* Highlight Details Card */}
      <Card>
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-bold">{highlight.name}</h1>
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
              <div className="flex items-center space-x-2 mt-2">
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
              </div>
            </div>
            
            {canEdit && (
              <div className="flex items-center space-x-2">
                <Button size="sm" onClick={handleEditContent}>
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
                {highlight.videoUrl ? (
                  <a
                    href={highlight.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </a>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateVideo}
                    disabled={!!latestPendingTask}
                  >
                    {latestPendingTask ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Generating...
                      </>
                    ) : (
                      'Generate Video'
                    )}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleDelete}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Generation Status */}
          {latestPendingTask && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 text-sm text-blue-700">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <span>Generating highlight video... This may take a few minutes.</span>
              </div>
            </div>
          )}

          {/* Statistics */}
          {highlightData && (
            <div className="flex items-center space-x-6 mb-6 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatTime(highlightData?.statistics.duration ?? 0)}</span>
                <span className="text-sm text-muted-foreground">duration</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{highlightData?.statistics.speakerCount ?? 0}</span>
                <span className="text-sm text-muted-foreground">speakers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-medium">{highlightData?.statistics.utteranceCount ?? 0}</span>
                <span className="text-sm text-muted-foreground">utterances</span>
              </div>
            </div>
          )}

          {/* Integrated Content & Video Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Content & Video</h3>
            
            {highlight.muxPlaybackId ? (
              /* Desktop: Side-by-side, Mobile: Stacked */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Content Preview - Left/Top */}
                <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50/50 to-transparent">
                  <div className="mb-3">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center">
                      <span className="mr-2">📝</span>
                      Content Preview
                    </h4>
                  </div>
                  <HighlightPreview 
                    highlightUtterances={highlightData?.highlightUtterances}
                    title=""
                    maxHeight="max-h-80"
                  />
                </div>
                
                {/* Video Player - Right/Bottom */}
                <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50/50 to-transparent">
                  <div className="mb-3">
                    <h4 className="font-medium text-sm text-muted-foreground flex items-center">
                      <span className="mr-2">🎬</span>
                      Video
                    </h4>
                  </div>
                  <div className="aspect-video rounded-lg overflow-hidden">
                    <HighlightVideo
                      id={highlight.id}
                      title={highlight.name}
                      playbackId={highlight.muxPlaybackId!}
                      videoUrl={highlight.videoUrl || undefined}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* No Video - Just Content Preview */
              <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50/50 to-transparent">
                <div className="mb-3">
                  <h4 className="font-medium text-sm text-muted-foreground flex items-center">
                    <span className="mr-2">📝</span>
                    Content Preview
                  </h4>
                </div>
                <HighlightPreview 
                  highlightUtterances={highlightData?.highlightUtterances}
                  title=""
                  maxHeight="max-h-80"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
} 