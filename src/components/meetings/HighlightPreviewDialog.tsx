"use client";
import React, { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Video as VideoIcon, Play, Pause, Monitor, Smartphone, CheckCircle, Clock, List, FileText } from 'lucide-react';
import { useHighlight } from './HighlightContext';
import { useVideo } from './VideoProvider';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { HighlightPreview } from './HighlightPreview';
import { Video } from './Video';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

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
  const { taskStatus } = useCouncilMeetingData();
  const isTranscriptVerified = Boolean(taskStatus.humanReview);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [view, setView] = useState<'preview' | 'status'>('preview');
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();
  const t = useTranslations('highlights');

  const captionsId = useId();
  const speakersId = useId();
  const aspectRatioName = useId();

  // Render settings (session-scoped only)
  const [includeCaptions, setIncludeCaptions] = useState(true);
  const [overlaySpeakerNames, setOverlaySpeakerNames] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'default' | 'social-9x16'>('default');
  const isSocial = aspectRatio === 'social-9x16';

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
      <DialogHeader className="w-full">
        <DialogTitle>{t('previewDialog.title')}</DialogTitle>
        <DialogDescription>
          {t('previewDialog.description')}
        </DialogDescription>
      </DialogHeader>

      {/* Preview area: video is the anchor, selected content beside it */}
      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Video preview (uses shared VideoProvider) */}
        <div className="space-y-3 lg:col-span-3">
          <div
            className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-black"
            onMouseEnter={() => setIsVideoHovered(true)}
            onMouseLeave={() => setIsVideoHovered(false)}
            onClick={togglePlayPause}
          >
            <Video className="w-full h-full" />
            {/* Play/pause affordance: always visible while paused, on hover while playing */}
            {(isVideoHovered || !isPlaying) && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white/80 hover:bg-white/90 text-black"
                  aria-label={isPlaying ? t('common.pause') : t('common.play')}
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

          {totalHighlights > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" onClick={goToPreviousHighlight} aria-label={t('common.previousClip')}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-[7rem] text-center text-sm font-medium" aria-live="polite">
                {t('previewDialog.clip', { current: currentHighlightIndex + 1, total: totalHighlights })}
              </span>
              <Button variant="outline" size="icon" onClick={goToNextHighlight} aria-label={t('common.nextClip')}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Selected content: matches the video's height on desktop, scrolls internally */}
        <div className="relative min-h-[10rem] lg:col-span-2">
          <HighlightPreview
            title={t('previewDialog.contentPreview')}
            maxHeight="max-h-72 lg:max-h-none"
            className="lg:absolute lg:inset-0"
          />
        </div>
      </div>

      {/* Settings: size and formatting side by side */}
      <div className="w-full rounded-lg border bg-muted/30 p-4">
        <h3 className="mb-3 text-sm font-semibold">{t('previewDialog.settings')}</h3>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* Size: aspect-ratio radio group */}
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-muted-foreground">{t('previewDialog.size')}</legend>
            <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
              <input
                type="radio"
                name={aspectRatioName}
                value="default"
                checked={!isSocial}
                onChange={() => setAspectRatio('default')}
                className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className={cn(!isSocial && "font-medium")}>{t('previewDialog.aspectDesktop')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
              <input
                type="radio"
                name={aspectRatioName}
                value="social-9x16"
                checked={isSocial}
                onChange={() => setAspectRatio('social-9x16')}
                className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className={cn(isSocial && "font-medium")}>{t('previewDialog.aspectMobile')}</span>
            </label>
          </fieldset>

          {/* Formatting: caption and speaker-overlay checkboxes */}
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-muted-foreground">{t('previewDialog.formatting')}</legend>
            <div className="flex items-center gap-2.5 py-1.5">
              <Checkbox
                id={captionsId}
                checked={includeCaptions}
                onCheckedChange={(checked) => setIncludeCaptions(checked === true)}
              />
              <Label htmlFor={captionsId} className="text-sm cursor-pointer">
                {t('previewDialog.captions')}
              </Label>
            </div>
            {includeCaptions && (
              <p
                className={cn(
                  "flex items-start gap-1.5 pl-[26px] pb-1 text-xs leading-snug",
                  isTranscriptVerified ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-500"
                )}
              >
                {isTranscriptVerified
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{isTranscriptVerified ? t('previewDialog.captionsVerified') : t('previewDialog.captionsUnverified')}</span>
              </p>
            )}
            <div className="flex items-center gap-2.5 py-1.5">
              <Checkbox
                id={speakersId}
                checked={overlaySpeakerNames}
                onCheckedChange={(checked) => setOverlaySpeakerNames(checked === true)}
              />
              <Label htmlFor={speakersId} className="text-sm cursor-pointer">
                {t('previewDialog.speakerOverlays')}
              </Label>
            </div>
          </fieldset>
        </div>
      </div>

      {/* Footer: summary on the left, actions on the right */}
      <div className="flex w-full flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {statistics ? (
            <>
              {t('common.duration')} {Math.round(statistics.duration)}s
              {' • '}{t('preview.speakerCount', { count: statistics.speakerCount })}
              {' • '}{t('preview.utteranceCount', { count: statistics.utteranceCount })}
            </>
          ) : (
            t('previewDialog.noUtterancesSelected')
          )}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <Button variant="outline" onClick={closePreviewDialog}>{t('common.close')}</Button>
          <Button
            onClick={handleGenerate}
            disabled={isSaving || isGenerating || totalHighlights === 0}
          >
            <VideoIcon className="mr-2 h-4 w-4" />
            {isGenerating ? t('details.generating') : generateCtaLabel}
          </Button>
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
      <DialogContent
        className={view === 'preview' ? 'max-w-5xl' : 'sm:max-w-md'}
        align={view === 'preview' ? 'start' : 'center'}
      >
        {view === 'preview' ? renderPreviewContent() : renderStatusContent()}
      </DialogContent>
    </Dialog>
  );
}
