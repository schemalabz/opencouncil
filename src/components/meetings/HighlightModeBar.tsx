"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { useHighlight } from './HighlightContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Users, Eye, EyeOff, Save, X, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { upsertHighlight } from '@/lib/db/highlights';
import { formatTime } from '@/lib/utils';
import { HighlightPreview } from './HighlightPreview';

export function HighlightModeBar() {
  const router = useRouter();
  const { 
    editingHighlight, 
    previewMode, 
    setEditingHighlight, 
    setPreviewMode, 
    statistics,
    currentHighlightIndex,
    totalHighlights,
    goToPreviousHighlight,
    goToNextHighlight,
    togglePreviewMode
  } = useHighlight();

  if (!editingHighlight) {
    return null;
  }

  const handleSave = async () => {
    try {
      await upsertHighlight({
        id: editingHighlight.id,
        name: editingHighlight.name,
        meetingId: editingHighlight.meetingId,
        cityId: editingHighlight.cityId,
        utteranceIds: editingHighlight.highlightedUtterances.map(hu => hu.utteranceId)
      });
      
      toast({
        title: "Success",
        description: "Highlight saved successfully.",
        variant: "default",
      });
    } catch (error) {
      console.error('Failed to save highlight:', error);
      toast({
        title: "Error",
        description: "Failed to save highlight. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    // Store values before clearing state
    const cityId = editingHighlight.cityId;
    const meetingId = editingHighlight.meetingId;
    
    // Clear local state first
    setEditingHighlight(null);
    setPreviewMode(false);
    
    // Redirect to highlights page
    router.push(`/${cityId}/${meetingId}/highlights`);
  };

  return (
    <Card className="mb-4 bg-primary/5 border-primary/20">
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header with controls and stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Badge variant="default" className="font-semibold">
                Editing Highlight
              </Badge>
              {previewMode && (
                <Badge variant="secondary" className="text-xs flex items-center space-x-1">
                  <Play className="h-3 w-3" />
                  <span>Preview Mode</span>
                </Badge>
              )}
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">{editingHighlight.name}</span>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{statistics ? formatTime(statistics.duration) : '0:00'}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{statistics?.speakerCount || 0} speakers</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>{statistics?.utteranceCount || 0} utterances</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Navigation Controls - Only show when there are highlights */}
              {totalHighlights > 0 && (
                <div className="flex items-center space-x-1 mr-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPreviousHighlight}
                    disabled={!previewMode && currentHighlightIndex === 0}
                    className="h-8 w-8 p-0"
                    title="Previous highlight"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <span className="text-xs text-muted-foreground px-1">
                    {currentHighlightIndex + 1}/{totalHighlights}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextHighlight}
                    disabled={!previewMode && currentHighlightIndex === totalHighlights - 1}
                    className="h-8 w-8 p-0"
                    title="Next highlight"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <Button
                variant={previewMode ? "default" : "outline"}
                size="sm"
                onClick={togglePreviewMode}
                className="flex items-center space-x-1"
                disabled={totalHighlights === 0}
              >
                {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{previewMode ? 'Exit Preview' : 'Preview'}</span>
              </Button>
              
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                className="flex items-center space-x-1"
              >
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="flex items-center space-x-1"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </Button>
            </div>
          </div>

          {/* Minimal Preview Mode Indicator */}
          {previewMode && totalHighlights > 0 && (
            <div className="text-center">
              <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded">
                🎬 Playing highlights only • Auto-advancing • Loop enabled
              </span>
            </div>
          )}

          {/* Integrated preview */}
          {previewMode && (
            <div className="border-t border-primary/10 pt-4">
              <HighlightPreview />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 