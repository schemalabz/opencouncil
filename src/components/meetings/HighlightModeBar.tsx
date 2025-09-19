"use client";
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useHighlight } from './HighlightContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Users, Eye, X, Edit, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { HighlightPreviewDialog } from './HighlightPreviewDialog';
import { AnimatePresence, motion } from 'framer-motion';
import { HighlightDialog } from './HighlightDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function HighlightModeBar() {
  const { 
    editingHighlight, 
    previewMode, 
    statistics,
    totalHighlights,
    hasUnsavedChanges,
    isSaving,
    resetToOriginal,
    exitEditMode,
    openPreviewDialog,
    saveHighlight
  } = useHighlight();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const t = useTranslations('highlights');

  if (!editingHighlight) {
    return null;
  }

  const handleSave = async () => {
    try {
      const result = await saveHighlight();
      
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('toasts.highlightUpdated'),
          variant: "default",
        });
      } else {
        toast({
          title: t('common.error'),
          description: t('toasts.saveFailedDescription'),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: t('common.error'),
        description: t('toasts.saveFailedDescription'),
        variant: "destructive",
      });
    }
  };

  const handleResetChanges = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm(t('reset.confirmReset'));
      if (confirmed) {
        resetToOriginal();
        toast({ title: t('reset.changesReset'), description: t('reset.changesResetDescription') });
      }
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm(t('exit.confirmExit'));
      if (!confirmed) {
        return;
      }
      toast({ title: t('exit.exitedEditMode'), description: t('exit.noChangesSaved') });
    } else {
      toast({ title: t('exit.exitedEditMode'), description: t('exit.returningToHighlights') });
    }
    exitEditMode();
  };

  const handleEditDetails = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (name: string, subjectId?: string) => {
    if (!editingHighlight) return;

    await saveHighlight({
      name,
      subjectId: subjectId || null,
      onSuccess: () => {
        toast({
          title: t('common.success'),
          description: t('toasts.highlightUpdated'),
          variant: "default",
        });
      },
      onError: (error) => {
        toast({
          title: t('common.error'),
          description: t('toasts.saveFailedDescription'),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <>
    <AnimatePresence initial={false}>
      <motion.div
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'tween', duration: 0.16 }}
      >
        <Card className="mb-4 bg-amber-50 motion-safe:transition-colors motion-safe:duration-150" disableHover>
          <div className="w-full h-full rounded-lg p-[1.5px] bg-amber-400">
            <div className="w-full h-full bg-amber-50 rounded-lg" style={{ borderRadius: "calc(0.5rem - 1.5px)" }}>
              <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header with controls and stats */}
              <motion.div layout className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex flex-col space-y-1">
                      <div className="text-sm font-semibold text-amber-700 uppercase tracking-wide">
                        {previewMode ? t('modeBar.currentlyPreviewing') : t('modeBar.currentlyEditingMode')}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                        <div className="flex items-center space-x-1">
                          <span className="font-medium text-sm">{editingHighlight.name}</span>
                          {hasUnsavedChanges && (
                            <div className="h-1.5 w-1.5 bg-red-500 rounded-full shadow-sm" title={t('modeBar.unsavedChanges')} />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 hover:bg-muted"
                            onClick={handleEditDetails}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center space-x-2 sm:space-x-4 text-sm text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>{statistics ? formatTime(statistics.duration) : '0:00'}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Users className="h-4 w-4" />
                            <span className="hidden sm:inline">{statistics?.speakerCount || 0} {t('modeBar.speakers')}</span>
                            <span className="sm:hidden">{statistics?.speakerCount || 0}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="hidden sm:inline">{statistics?.utteranceCount || 0} {t('modeBar.utterances')}</span>
                            <span className="sm:hidden">{statistics?.utteranceCount || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <motion.div layout className="flex items-center space-x-2">
                  {/* Save dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 w-8 p-0" 
                        aria-label="Save actions"
                        disabled={!hasUnsavedChanges && !isSaving}
                      >
                        {isSaving ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
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
                            {t('modeBar.saving')}
                          </>
                        ) : (
                          t('modeBar.saveNow')
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleResetChanges}
                        disabled={!hasUnsavedChanges || isSaving}
                      >
                        {t('modeBar.resetChanges')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Preview toggle: outline even when active for non-primary feel */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openPreviewDialog}
                    className="flex items-center space-x-1"
                    disabled={totalHighlights === 0}
                    title={t('modeBar.openPreview')}
                    aria-label={t('modeBar.openPreview')}
                  >
                    <Eye className="h-4 w-4" />
                    <span>{t('modeBar.preview')}</span>
                  </Button>
                  
                  {/* Cancel only when not in preview */}
                  {!previewMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="flex items-center space-x-1"
                      title={t('modeBar.exitEditingMode')}
                      aria-label={t('modeBar.exitEditingMode')}
                    >
                      <X className="h-4 w-4" />
                      <span className="ml-1">{t('modeBar.exit')}</span>
                    </Button>
                  )}
                </motion.div>
              </motion.div>

              <HighlightPreviewDialog />
            </div>
              </CardContent>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>

    {/* Edit Dialog */}
    {editingHighlight && (
      <HighlightDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        highlight={editingHighlight}
        onSave={handleSaveEdit}
        mode="edit"
      />
    )}
    </>
  );
} 