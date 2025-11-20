"use client";
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTranscriptOptions } from './options/OptionsContext';
import { useVideo } from './VideoProvider';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useHighlight } from './HighlightContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Edit, Gauge, UserRoundSearch, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function EditingModeBar() {
    const { options, updateOptions } = useTranscriptOptions();
    const { playbackSpeed, handleSpeedChange, seekTo, currentTime } = useVideo();
    const { transcript: speakerSegments, getSpeakerTag } = useCouncilMeetingData();
    const { editingHighlight } = useHighlight(); // To check for exclusivity
    const t = useTranslations('editing');

    // If not editable OR if we are currently editing a highlight, do not show this bar
    if (!options.editable || editingHighlight) {
        return null;
    }

    const handleExit = () => {
        updateOptions({ editable: false });
        toast({ title: t('toasts.exited'), description: t('toasts.exitedDescription') });
    };

    const goToNextUnknown = () => {
        // Find current segment index
        const currentSegmentIndex = speakerSegments.findIndex(s =>
            currentTime >= s.startTimestamp && currentTime < s.endTimestamp
        );

        // Start searching from next segment
        const startIndex = currentSegmentIndex === -1 ? 0 : currentSegmentIndex + 1;

        for (let i = startIndex; i < speakerSegments.length; i++) {
            const segment = speakerSegments[i];
            const speakerTag = getSpeakerTag(segment.speakerTagId);
            // If personId is null/undefined, it's likely unknown
            if (!speakerTag?.personId) {
                seekTo(segment.startTimestamp);
                return;
            }
        }

        toast({ description: t('toasts.noMoreUnknown') });
    };

    return (
        <AnimatePresence initial={false}>
            <motion.div
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'tween', duration: 0.16 }}
            >
                <Card className="mb-4 bg-slate-50 motion-safe:transition-colors motion-safe:duration-150" disableHover>
                    <div className="w-full h-full rounded-lg p-[1.5px] bg-slate-400">
                        <div className="w-full h-full bg-slate-50 rounded-lg" style={{ borderRadius: "calc(0.5rem - 1.5px)" }}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    
                                    {/* Left Side: Status */}
                                    <div className="flex items-center space-x-4">
                                        <div className="flex flex-col space-y-1">
                                            <div className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                                                <Edit className="w-4 h-4" />
                                                {t('status.title')}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {t('status.description')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Side: Actions */}
                                    <div className="flex items-center space-x-2">
                                        
                                        {/* Playback Speed */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center space-x-1"
                                                >
                                                    <Gauge className="h-4 w-4 mr-1" />
                                                    <span>{parseFloat(playbackSpeed).toFixed(1)}x</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                                                    <DropdownMenuItem
                                                        key={speed}
                                                        onClick={() => handleSpeedChange(speed.toString())}
                                                        className={Math.abs(parseFloat(playbackSpeed) - speed) < 0.01 ? "bg-accent font-bold" : ""}
                                                    >
                                                        {speed}x
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>

                                        {/* Unknown Speaker Navigation */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={goToNextUnknown}
                                            className="flex items-center space-x-1"
                                            title={t('actions.nextUnknown')}
                                        >
                                            <UserRoundSearch className="h-4 w-4 mr-1" />
                                            <span className="hidden sm:inline">{t('actions.unknownSpeaker')}</span>
                                        </Button>

                                        {/* Exit Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleExit}
                                            className="flex items-center space-x-1 hover:bg-slate-200"
                                        >
                                            <X className="h-4 w-4" />
                                            <span className="ml-1">{t('actions.exit')}</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </AnimatePresence>
    );
}

