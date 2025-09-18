"use client";
import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { toast } from '@/hooks/use-toast';
import Combobox from '@/components/Combobox';
import { Loader2 } from 'lucide-react';

interface HighlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight?: HighlightWithUtterances | null;
  onSave: (name: string, subjectId?: string) => Promise<void>;
  mode: 'create' | 'edit';
}

export function HighlightDialog({ 
  open, 
  onOpenChange, 
  highlight, 
  onSave, 
  mode 
}: HighlightDialogProps) {
  const { subjects } = useCouncilMeetingData();
  const [name, setName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('highlights');

  // Reset form when dialog opens/closes or highlight changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && highlight) {
        setName(highlight.name);
        const connectedSubject = highlight.subjectId ? subjects.find(s => s.id === highlight.subjectId) : null;
        setSelectedSubject(connectedSubject ? { id: connectedSubject.id, name: connectedSubject.name } : null);
      } else {
        setName('');
        setSelectedSubject(null);
      }
      // Reset loading state
      setIsLoading(false);
    }
  }, [open, mode, highlight, subjects]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: t('common.error'),
        description: t('dialog.nameRequired'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave(name, selectedSubject?.id);
      // Dialog will close automatically after redirect
    } catch (error) {
      console.error('Failed to save highlight:', error);
      setIsLoading(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Creating Highlight...' : 'Saving Changes...'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                {mode === 'create' 
                  ? 'Creating your highlight...' 
                  : 'Saving your changes...'
                }
              </p>
              {mode === 'create' && (
                <p className="text-sm text-muted-foreground">
                  You&apos;ll be redirected to the transcript page to select utterances for your highlight.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('dialog.createTitle') : t('dialog.editTitle')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="highlight-name">{t('dialog.highlightName')}</Label>
            <Input
              id="highlight-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('dialog.namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>

          {/* Subject Selection */}
          <div className="space-y-2">
            <Label>{t('common.connectedSubject')}</Label>
            
            <Combobox
              items={subjects}
              value={selectedSubject}
              onChange={setSelectedSubject}
              placeholder={t('dialog.subjectPlaceholder')}
              searchPlaceholder={t('dialog.subjectSearchPlaceholder')}
              getItemLabel={(subject) => subject.name}
              getItemValue={(subject) => subject.id}
              clearable={true}
              emptyMessage={t('dialog.noSubjectsFound')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dialog.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {mode === 'create' ? t('dialog.create') : t('dialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 