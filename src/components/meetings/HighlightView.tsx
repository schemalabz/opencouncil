"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import type { HighlightWithUtterances } from "@/lib/db/highlights";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, Star, Edit, Trash, Download, ArrowLeft, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { HighlightVideo } from './HighlightVideo';
import { formatTime, formatRelativeTime } from "@/lib/utils";
import { HighlightPreview } from "./HighlightPreview";
import { useHighlight } from "./HighlightContext";
import { useTranscriptOptions } from "./options/OptionsContext";

interface HighlightViewProps {
  highlight: HighlightWithUtterances;
}

export function HighlightView({ highlight }: HighlightViewProps) {
  const router = useRouter();
  const locale = useLocale();
  const { meeting, subjects, removeHighlight, updateHighlight } = useCouncilMeetingData();
  const { calculateHighlightData } = useHighlight();
  const { options } = useTranscriptOptions();
  const canEdit = options.editsAllowed;
  const [latestPendingTask, setLatestPendingTask] = useState<string | null>(null);

  const highlightData = calculateHighlightData(highlight);

  const fetchTaskStatuses = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/generate-highlight?cityId=${meeting.cityId}&meetingId=${meeting.id}&highlightId=${highlight.id}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const t: { id: string; status: string; updatedAt: string }[] = await res.json();
      if (t.length > 0) {
        const latest = t[0];
        if (latest.status === 'pending') {
          setLatestPendingTask(latest.id);
        } else if (latest.status === 'succeeded' && !highlight.muxPlaybackId) {
          const justCompleted = Date.now() - new Date(latest.updatedAt).getTime() < 6000;
          if (justCompleted) {
            setLatestPendingTask(null);
            router.refresh();
          }
        } else if (latest.status === 'succeeded' || latest.status === 'failed') {
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
    router.push(`/${meeting.cityId}/${meeting.id}/transcript?highlight=${highlight.id}`);
  };


  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this highlight?')) {
      return;
    }

    try {
      const res = await fetch(`/api/highlights/${highlight.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      
      // Update the context to remove the highlight
      removeHighlight(highlight.id);
      
      toast({
        title: "Success",
        description: "Highlight deleted successfully.",
        variant: "default",
      });
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
      const res = await fetch(`/api/tasks/generate-highlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlightId: highlight.id })
      });
      if (!res.ok) throw new Error('Failed to start generation');
      const task = await res.json();
      toast({
        title: "Success",
        description: "Video generation started. This may take a few minutes.",
        variant: "default",
      });
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
      const res = await fetch(`/api/highlights/${highlight.id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to toggle showcase');
      
      const updatedHighlight = await res.json();
      
      // Update the context with the new showcase status
      updateHighlight(highlight.id, { isShowcased: updatedHighlight.isShowcased });
      
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
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <h1 className="text-2xl font-bold mt-1">{highlight.name}</h1>
                </div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-muted-foreground">Connected Subject:</label>
                  {highlight.subjectId ? (
                    <Badge variant="outline" className="text-xs">
                      {subjects.find(s => s.id === highlight.subjectId)?.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      No subject
                    </Badge>
                  )}
                </div>
                {highlight.isShowcased && (
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Showcased
                    </Badge>
                  </div>
                )}
                <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Last updated {formatRelativeTime(highlight.updatedAt, locale)}</span>
                </div>
              </div>
            </div>
            
            {canEdit && (
              <div className="flex items-center space-x-2">
                <Button size="sm" onClick={handleEditContent}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Highlight
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
                  <div className="rounded-lg overflow-hidden">
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

    </div>
  );
} 