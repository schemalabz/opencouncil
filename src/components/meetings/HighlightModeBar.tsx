"use client";
import React, { useMemo, useState } from 'react';
import { useHighlight } from './HighlightContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Users, Eye, EyeOff, X, Play, Video, Settings, Pencil } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { requestGenerateHighlight } from '@/lib/tasks/generateHighlight';
import { formatTime } from '@/lib/utils';
import { HighlightPreview } from './HighlightPreview';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function HighlightModeBar() {
  const { 
    editingHighlight, 
    previewMode, 
    statistics,
    totalHighlights,
    hasUnsavedChanges,
    isSaving,
    isEditingDisabled,
    resetToOriginal,
    exitEditMode,
    exitEditModeAndRedirectToHighlight,
    togglePreviewMode,
    saveHighlight
  } = useHighlight();

  // Simple render settings stub (persist only in this component for now)
  const [includeCaptions, setIncludeCaptions] = useState(false);
  const [overlaySpeakerNames, setOverlaySpeakerNames] = useState(false);

  const hasExistingVideo = useMemo(() => {
    if (!editingHighlight) return false;
    return Boolean(editingHighlight.videoUrl || editingHighlight.muxPlaybackId);
  }, [editingHighlight]);

  const helperText = useMemo(() => {
    if (!previewMode) {
      let base = 'Click utterances to add or remove them from the highlight.';
      if (totalHighlights === 0) return base;
      if (hasUnsavedChanges) return `${base} You've made changes. Preview to check or generate when ready.`;
      return `${base} You can preview your selection or generate a video when ready.`;
    }
    // preview mode
    if (hasExistingVideo) return 'Previewing your selection. Re-generate to update the video.';
    return 'Previewing your selection. Generate a video when ready.';
  }, [previewMode, totalHighlights, hasUnsavedChanges, hasExistingVideo]);

  if (!editingHighlight) {
    return null;
  }

  const handleSave = async () => {
    try {
      const result = await saveHighlight();
      
      if (result.success) {
        toast({
          title: "Saved",
          description: "Highlight changes saved.",
          variant: "default",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save highlight. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Error",
        description: "Failed to save highlight. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateHighlight = async () => {
    try {
      await requestGenerateHighlight(editingHighlight.id, {
        includeCaptions,
        includeSpeakerOverlay: overlaySpeakerNames,
      });
      toast({
        title: "Generation Started",
        description: "Redirecting you to the highlight page where you can track progress and see the video when ready.",
        variant: "default",
      });
      // Redirect to the individual highlight page where they can see progress
      exitEditModeAndRedirectToHighlight();
    } catch (error) {
      console.error('Failed to generate video:', error);
      toast({
        title: "Error",
        description: "Failed to generate video. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveAndGenerate = async () => {
    try {
      const result = await saveHighlight();
      if (!result.success) {
        toast({
          title: "Save failed",
          description: "Please resolve issues and try again.",
          variant: "destructive",
        });
        return;
      }
      await handleGenerateHighlight();
    } catch (error) {
      console.error('Save & Generate failed:', error);
      toast({
        title: "Error",
        description: "Could not save and generate video.",
        variant: "destructive",
      });
    }
  };

  const handleResetChanges = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm('Are you sure you want to reset all changes? This cannot be undone.');
      if (confirmed) {
        resetToOriginal();
        toast({ title: 'Changes reset', description: 'All unsaved changes were discarded.' });
      }
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to cancel?');
      if (!confirmed) {
        return;
      }
      toast({ title: 'Exited edit mode', description: 'No changes were saved.' });
    } else {
      toast({ title: 'Exited edit mode', description: 'Returning to highlights.' });
    }
    exitEditMode();
  };

  // Single CTA will auto-save if needed; label adapts based on existing video
  const generateCtaLabel = hasExistingVideo ? 'Re-generate Video' : 'Generate Video';

  return (
    <AnimatePresence initial={false}>
      <motion.div
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'tween', duration: 0.16 }}
      >
        <Card className="mb-4 bg-amber-50 border-amber-200 motion-safe:transition-colors motion-safe:duration-150">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header with controls and stats */}
              <motion.div layout className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Badge
                    variant="default"
                    className="font-semibold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1.5"
                    title="You are editing a highlight"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editing Highlight
                  </Badge>
                  {previewMode && (
                    <Badge variant="secondary" className="text-xs flex items-center space-x-1">
                      <Play className="h-3 w-3" />
                      <span>Preview Mode</span>
                    </Badge>
                  )}
                  {hasUnsavedChanges && (
                    <Badge variant="destructive" className="text-xs flex items-center space-x-1">
                      <span>Unsaved Changes</span>
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
                
                <motion.div layout className="flex items-center space-x-2">
                  {/* Preview toggle: outline even when active for non-primary feel */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePreviewMode}
                    className="flex items-center space-x-1"
                    disabled={totalHighlights === 0}
                    title={previewMode ? 'Exit preview' : 'Enter preview'}
                    aria-label={previewMode ? 'Exit preview' : 'Enter preview'}
                  >
                    {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span>{previewMode ? 'Exit Preview' : 'Preview'}</span>
                  </Button>
                  
                  {/* Cancel only when not in preview */}
                  {!previewMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="flex items-center space-x-1"
                      title="Exit editing mode"
                      aria-label="Exit editing mode"
                    >
                      <X className="h-4 w-4" />
                      <span className="ml-1">Exit Editing</span>
                    </Button>
                  )}

                  {/* Preview mode actions: Generate, Settings, Overflow */}
                  <AnimatePresence>
                    {previewMode && (
                      <motion.div
                        key="preview-actions"
                        layout
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 6 }}
                        transition={{ duration: 0.14 }}
                        className="flex items-center gap-2"
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={hasUnsavedChanges ? handleSaveAndGenerate : handleGenerateHighlight}
                          disabled={isSaving || totalHighlights === 0}
                          className="flex items-center space-x-1"
                        >
                          <motion.span
                            key={isSaving ? 'saving' : 'ready'}
                            initial={{ opacity: 0, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -2 }}
                            transition={{ duration: 0.12 }}
                            className="inline-flex items-center gap-1"
                          >
                            {isSaving ? (
                              <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span>Saving…</span>
                              </>
                            ) : (
                              <>
                                <Video className="h-4 w-4" />
                                <span>{generateCtaLabel}</span>
                              </>
                            )}
                          </motion.span>
                        </Button>

                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 px-2" aria-label="Render settings">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-80">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="captions">Show captions on video</Label>
                                <Switch id="captions" checked={includeCaptions} onCheckedChange={setIncludeCaptions} />
                              </div>
                              <div className="flex items-center justify-between">
                                <Label htmlFor="overlayNames">Overlay speaker names</Label>
                                <Switch id="overlayNames" checked={overlaySpeakerNames} onCheckedChange={setOverlaySpeakerNames} />
                              </div>
                              <p className="text-xs text-muted-foreground">TODO: These options are UI-only for now; backend will ignore them until implemented.</p>
                            </div>
                          </PopoverContent>
                        </Popover>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="More actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={handleSave}
                              disabled={!hasUnsavedChanges || isSaving}
                            >
                              {isSaving ? (
                                <>
                                  <div className="h-3 w-3 mr-2 animate-spin rounded-full border border-current border-t-transparent" />
                                  Saving…
                                </>
                              ) : (
                                'Save now'
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={handleResetChanges}
                              disabled={!hasUnsavedChanges || isSaving}
                            >
                              Reset changes
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>

              {/* Persistent helper row under title (no animation) */}
              <div className="text-xs text-muted-foreground">
                {helperText}
              </div>

              {/* Integrated preview remains */}
              <AnimatePresence>
                {previewMode && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="pt-3"
                  >
                    <HighlightPreview />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
} 