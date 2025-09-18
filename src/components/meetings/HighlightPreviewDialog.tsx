"use client";
import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Video as VideoIcon, Play, Pause, Monitor, Smartphone, CheckCircle, Clock, List, FileText } from 'lucide-react';
import { useHighlight } from './HighlightContext';
import { useVideo } from './VideoProvider';
import { HighlightPreview } from './HighlightPreview';
import { Video } from './Video';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export function HighlightPreviewDialog() {
  const {
    editingHighlight,
    isPreviewDialogOpen,
    closePreviewDialog,
    hasUnsavedChanges,
    isSaving,
    statistics,
    totalHighlights,
    currentHighlightIndex,
    goToPreviousHighlight,
    goToNextHighlight,
    saveHighlight,
    exitEditModeAndRedirectToHighlight,
    exitEditMode,
  } = useHighlight();

  const { isPlaying, togglePlayPause } = useVideo();
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [view, setView] = useState<'preview' | 'status'>('preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();
  const t = useTranslations('highlights');

  // Render settings (session-scoped only)
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [overlaySpeakerNames, setOverlaySpeakerNames] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'default' | 'social-9x16'>('default');

  const hasExistingVideo = useMemo(() => Boolean(editingHighlight?.videoUrl || editingHighlight?.muxPlaybackId), [editingHighlight]);
  const generateCtaLabel = hasExistingVideo ? t('previewDialog.regenerateVideo') : t('previewDialog.generateVideo');

  if (!editingHighlight) return null;

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      
      if (hasUnsavedChanges) {
        const result = await saveHighlight();
        if (!result.success) {
          toast({ title: t('toasts.saveFailed'), description: t('toasts.saveFailedDescription'), variant: 'destructive' });
          return;
        }
      }

      const res = await fetch(`/api/tasks/generate-highlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          highlightId: editingHighlight.id,
          options: {
            includeCaptions,
            includeSpeakerOverlay: overlaySpeakerNames,
            aspectRatio,
            ...(aspectRatio === 'social-9x16' && { socialOptions: { marginType: 'blur', zoomFactor: 1.0 } })
          }
        })
      });
      if (!res.ok) throw new Error('Failed to start generation');

      toast({
        title: t('previewDialog.generationStarted'),
        description: t('toasts.generationStarted'),
        variant: 'default',
      });
      setView('status');
    } catch (error) {
      console.error('Failed to generate video:', error);
      toast({ title: t('common.error'), description: t('toasts.generationError'), variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTrackProgress = () => {
    closePreviewDialog();
    exitEditModeAndRedirectToHighlight();
  };

  const handleViewAllHighlights = () => {
    if (!editingHighlight) return;
    closePreviewDialog();
    exitEditMode();
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/highlights`);
  };

  const handleReturnToTranscript = () => {
    if (!editingHighlight) return;
    closePreviewDialog();
    exitEditMode();
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/transcript`);
  };

  const renderPreviewContent = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('previewDialog.title')}</DialogTitle>
        <DialogDescription>
          {t('previewDialog.description')}
        </DialogDescription>
      </DialogHeader>

        {/* Unified preview area: text and video same height, controls below */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {/* Text Preview */}
          <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50/50 to-transparent flex flex-col">
            <div className="flex-1 min-h-[25vh] max-h-[35vh] overflow-auto">
              <HighlightPreview title="Content Preview" maxHeight="max-h-none" />
            </div>
          </div>

          {/* Video Preview (uses shared VideoProvider) */}
          <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50/50 to-transparent flex flex-col">
            <div className="flex-1 min-h-[25vh] max-h-[35vh] relative">
              <div 
                className="rounded-lg overflow-hidden h-full bg-black cursor-pointer relative"
                onMouseEnter={() => setIsVideoHovered(true)}
                onMouseLeave={() => setIsVideoHovered(false)}
                onClick={togglePlayPause}
              >
                <Video className="w-full h-full" />
                {/* Hover overlay with play/pause */}
                {isVideoHovered && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="bg-white/80 hover:bg-white/90 text-black"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlayPause();
                      }}
                    >
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Clip navigation below video */}
            {totalHighlights > 0 && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={goToPreviousHighlight} aria-label={t('common.previousClip')}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="px-3 py-1 text-sm bg-amber-100 text-amber-900 border border-amber-200 rounded">
                  {t('previewDialog.clip', { current: currentHighlightIndex + 1, total: totalHighlights })}
                </div>
                <Button variant="outline" size="sm" onClick={goToNextHighlight} aria-label={t('common.nextClip')}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Always visible compact settings */}
        <div className="mt-4 space-y-3">
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('previewDialog.format')}</span>
                <Button
                  variant={aspectRatio === 'default' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAspectRatio('default')}
                  className="h-7 px-2"
                >
                  <Monitor className="h-3 w-3 mr-1" />
                  16:9
                </Button>
                <Button
                  variant={aspectRatio === 'social-9x16' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAspectRatio('social-9x16')}
                  className="h-7 px-2"
                >
                  <Smartphone className="h-3 w-3 mr-1" />
                  9:16
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={includeCaptions ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setIncludeCaptions(!includeCaptions)}
                  className="h-7 px-2 text-xs"
                >
                  {t('previewDialog.captions')}
                </Button>
                <Button
                  variant={overlaySpeakerNames ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setOverlaySpeakerNames(!overlaySpeakerNames)}
                  className="h-7 px-2 text-xs"
                >
                  {t('previewDialog.speakerOverlays')}
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {statistics ? (
                <span>
                  {t('common.duration')} {Math.round(statistics.duration)}s • {statistics.speakerCount} {t('common.speakers')} • {statistics.utteranceCount} {t('common.utterances')}
                </span>
              ) : (
                <span>{t('previewDialog.noUtterancesSelected')}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerate}
                disabled={isSaving || isGenerating || totalHighlights === 0}
                className="flex items-center space-x-1"
              >
                <VideoIcon className="h-4 w-4" />
                <span>{isGenerating ? t('details.generating') : generateCtaLabel}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={closePreviewDialog}>{t('common.close')}</Button>
            </div>
          </div>
        </div>
    </>
  );

  const renderStatusContent = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('previewDialog.generationStarted')}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span>{t('toasts.generationStarted')}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="text-center">
          <h4 className="text-sm font-medium mb-1">{t('previewDialog.whatNext')}</h4>
        </div>
        
        <div className="grid gap-3">
          <Button 
            onClick={handleTrackProgress} 
            className="h-12 justify-start text-left p-4 hover:bg-primary/5 transition-colors" 
            variant="outline"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{t('previewDialog.trackProgress')}</div>
                <div className="text-xs text-muted-foreground">{t('previewDialog.trackProgressDescription')}</div>
              </div>
            </div>
          </Button>
          
          <Button 
            onClick={handleViewAllHighlights} 
            className="h-12 justify-start text-left p-4 hover:bg-primary/5 transition-colors" 
            variant="outline"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <List className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{t('previewDialog.viewAllHighlights')}</div>
                <div className="text-xs text-muted-foreground">{t('previewDialog.viewAllHighlightsDescription')}</div>
              </div>
            </div>
          </Button>
          
          <Button 
            onClick={handleReturnToTranscript} 
            className="h-12 justify-start text-left p-4 hover:bg-primary/5 transition-colors" 
            variant="outline"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{t('previewDialog.returnToTranscript')}</div>
                <div className="text-xs text-muted-foreground">{t('previewDialog.returnToTranscriptDescription')}</div>
              </div>
            </div>
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={isPreviewDialogOpen} onOpenChange={(open) => (open ? undefined : closePreviewDialog())}>
      <DialogContent className={view === 'preview' ? 'max-w-5xl' : 'sm:max-w-md'}>
        {view === 'preview' ? renderPreviewContent() : renderStatusContent()}
      </DialogContent>
    </Dialog>
  );
}
