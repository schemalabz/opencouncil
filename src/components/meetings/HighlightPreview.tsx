"use client";
import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Quote } from 'lucide-react';
import { HighlightUtterance } from './HighlightContext';
import { useHighlight } from './HighlightContext';
import { cn } from '@/lib/utils';

interface HighlightPreviewProps {
  className?: string;
  highlightUtterances?: HighlightUtterance[];
  title?: string;
  maxHeight?: string;
}

interface SpeakerBlock {
  speakerName: string;
  utteranceCount: number;
  texts: React.ReactNode[];
}

export function HighlightPreview({ 
  className, 
  highlightUtterances: externalHighlightUtterances,
  title = "Preview",
  maxHeight = "max-h-32"
}: HighlightPreviewProps) {
  // Use external utterances if provided, otherwise fall back to context
  const { editingHighlight, highlightUtterances: contextHighlightUtterances } = useHighlight();
  const utterances = externalHighlightUtterances || contextHighlightUtterances;
  const t = useTranslations('highlights');

  // Memoize the speaker blocks to prevent unnecessary re-renders
  const speakerBlocks = useMemo(() => {
    if (!utterances || utterances.length === 0) return [];

    const blocks: SpeakerBlock[] = [];
    let currentSpeaker = '';
    let currentTexts: React.ReactNode[] = [];
    let currentUtteranceCount = 0;

    // Iterate through utterances in chronological order
    for (let i = 0; i < utterances.length; i++) {
      const utterance = utterances[i];
      
      // If this is a new speaker, save the previous speaker's block and start a new one
      if (utterance.speakerName !== currentSpeaker) {
        // Save the previous speaker's block if it exists
        if (currentSpeaker && currentTexts.length > 0) {
          blocks.push({
            speakerName: currentSpeaker,
            utteranceCount: currentUtteranceCount,
            texts: currentTexts
          });
        }

        // Start new speaker block
        currentSpeaker = utterance.speakerName;
        currentTexts = [utterance.text];
        currentUtteranceCount = 1;
      } else {
        // Same speaker - check if there's a gap between this utterance and the previous one
        if (i > 0) {
          const previousUtterance = utterances[i - 1];
          const gap = utterance.startTimestamp - previousUtterance.endTimestamp;
          
          // If there's a significant gap (>2 seconds), add gap indicator
          if (gap > 2) {
            currentTexts.push(
              <span key={`gap-${utterance.id}`} className="text-xs text-muted-foreground/60 italic">
                [...]
              </span>
            );
          }
        }
        
        // Add the current utterance's text
        currentTexts.push(
          <span key={utterance.id}>
            {utterance.text}
          </span>
        );
        currentUtteranceCount++;
      }
    }

    // Add the last speaker's block (if any)
    if (currentSpeaker && currentTexts.length > 0) {
      blocks.push({
        speakerName: currentSpeaker,
        utteranceCount: currentUtteranceCount,
        texts: currentTexts
      });
    }

    return blocks;
  }, [utterances]);

  // If using external utterances, don't require editingHighlight
  if (!utterances || utterances.length === 0) {
    return (
      <div className={cn('bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4', className)}>
        <div className="text-center py-4 text-muted-foreground">
          <Quote className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('editing.noUtterances')}</p>
          <p className="text-xs mt-1">{t('editing.emptyHighlight')}</p>
        </div>
      </div>
    );
  }

  // If using context and no editing highlight, return null
  if (!externalHighlightUtterances && !editingHighlight) {
    return null;
  }

  return (
    <div className={cn('flex flex-col bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4', className)}>
      <div className="flex items-center space-x-2 mb-3 shrink-0">
        <Quote className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">{title}</span>
      </div>

      <div className={cn('space-y-3 overflow-y-auto flex-1 min-h-0', maxHeight)}>
        {speakerBlocks.map((block, index) => (
          <div key={`${block.speakerName}-${index}`} className="space-y-1">
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {block.speakerName}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('preview.utteranceCount', { count: block.utteranceCount })}
              </span>
            </div>
            <div className="pl-2 border-l-2 border-primary/20">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {block.texts}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 