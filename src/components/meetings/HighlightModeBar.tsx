"use client";
import React from 'react';
import { useHighlight } from './HighlightContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Users, Eye, EyeOff, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { upsertHighlight } from '@/lib/db/highlights';
import { formatTime } from '@/lib/utils';
import { HighlightPreview } from './HighlightPreview';

export function HighlightModeBar() {
  const { editingHighlight, previewMode, setEditingHighlight, setPreviewMode, statistics } = useHighlight();

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
    setEditingHighlight(null);
    setPreviewMode(false);
  };

  const togglePreview = () => {
    setPreviewMode(!previewMode);
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
              <Button
                variant="outline"
                size="sm"
                onClick={togglePreview}
                className="flex items-center space-x-1"
              >
                {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{previewMode ? 'Hide Preview' : 'Preview'}</span>
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