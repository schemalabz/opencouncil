"use client";
import React from 'react';
import { useHighlight } from './HighlightContext';
import { useTranscriptOptions } from './options/OptionsContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Users, Eye, EyeOff, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { upsertHighlight } from '@/lib/db/highlights';

export function HighlightModeBar() {
  const { editingHighlight, previewMode, setEditingHighlight, setPreviewMode } = useHighlight();
  const { updateOptions } = useTranscriptOptions();

  if (!editingHighlight) {
    return null;
  }

  const utteranceCount = editingHighlight.highlightedUtterances.length;
  const duration = editingHighlight.highlightedUtterances.length > 0 
    ? editingHighlight.highlightedUtterances.reduce((sum, hu) => {
        // Note: For now we'll show a placeholder duration calculation
        // This will be enhanced in Phase 1.3 with proper composition metadata
        return sum + 5; // Placeholder: assume 5 seconds per utterance
      }, 0)
    : 0;

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
    updateOptions({ selectedHighlight: null });
  };

  const togglePreview = () => {
    setPreviewMode(!previewMode);
  };

  return (
    <Card className="mb-4 bg-primary/5 border-primary/20">
      <CardContent className="p-4">
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
                  <span>{duration}s</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{utteranceCount} segments</span>
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
      </CardContent>
    </Card>
  );
} 