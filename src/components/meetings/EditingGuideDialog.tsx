"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';
import { ACTIONS, getActionKeyLabel } from '@/contexts/KeyboardShortcutsContext';

/**
 * The keys for one action, read from the definitions the dispatcher runs on.
 * The shortcuts this guide does not own — the ones the utterance editor and the
 * mouse handle — stay written out below.
 */
function ActionKey({ actionId }: { actionId: string }) {
    return <Badge variant="secondary">{getActionKeyLabel(actionId)}</Badge>;
}

interface EditingGuideDialogProps {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
}

export function EditingGuideDialog({ children, onOpenChange }: EditingGuideDialogProps) {
    const t = useTranslations('editing.guide');

    return (
        <Dialog onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>
                
                <Tabs defaultValue="quickstart" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="quickstart">{t('tabs.quickStart')}</TabsTrigger>
                        <TabsTrigger value="shortcuts">{t('tabs.shortcuts')}</TabsTrigger>
                        <TabsTrigger value="tasks">{t('tabs.commonTasks')}</TabsTrigger>
                        <TabsTrigger value="visual">{t('tabs.visualGuide')}</TabsTrigger>
                    </TabsList>
                    
                    {/* Tab 1: Quick Start */}
                    <TabsContent value="quickstart" className="space-y-4 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">{t('quickStart.whatIsIt.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('quickStart.whatIsIt.description')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">{t('quickStart.workflow.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex gap-3">
                                    <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0">1</Badge>
                                    <p className="text-sm">{t('quickStart.workflow.step1')}</p>
                                </div>
                                <div className="flex gap-3">
                                    <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0">2</Badge>
                                    <p className="text-sm">{t('quickStart.workflow.step2')}</p>
                                </div>
                                <div className="flex gap-3">
                                    <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0">3</Badge>
                                    <p className="text-sm">{t('quickStart.workflow.step3')}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">{t('quickStart.legend.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-0.5 w-12 bg-green-500"></div>
                                    <span className="text-sm">{t('quickStart.legend.userEdited')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-0.5 w-12 bg-blue-500"></div>
                                    <span className="text-sm">{t('quickStart.legend.aiCorrected')}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* Tab 2: Keyboard Shortcuts */}
                    <TabsContent value="shortcuts" className="space-y-4 mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('shortcuts.playback.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.playPause')}</span>
                                        <ActionKey actionId={ACTIONS.PLAY_PAUSE.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.previous')}</span>
                                        <ActionKey actionId={ACTIONS.SEEK_PREVIOUS.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.next')}</span>
                                        <ActionKey actionId={ACTIONS.SEEK_NEXT.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.skipBackward')}</span>
                                        <ActionKey actionId={ACTIONS.SKIP_BACKWARD.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.skipForward')}</span>
                                        <ActionKey actionId={ACTIONS.SKIP_FORWARD.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.playback.speedUp')}</span>
                                        <ActionKey actionId={ACTIONS.SPEED_UP.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('shortcuts.playback.speedDown')}</span>
                                        <ActionKey actionId={ACTIONS.SPEED_DOWN.id} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('shortcuts.editing.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.editing.saveAndNext')}</span>
                                        <ActionKey actionId={ACTIONS.EDIT_NEXT_UTTERANCE.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('shortcuts.editing.cancel')}</span>
                                        <Badge variant="secondary">Esc</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('shortcuts.utteranceEditing.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.utteranceEditing.playPause')}</span>
                                        <Badge variant="secondary">Shift+Space</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.utteranceEditing.skipBackward')}</span>
                                        <Badge variant="secondary">Shift+←</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.utteranceEditing.skipForward')}</span>
                                        <Badge variant="secondary">Shift+→</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.utteranceEditing.setStartTime')}</span>
                                        <Badge variant="secondary">Shift+[</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('shortcuts.utteranceEditing.setEndTime')}</span>
                                        <Badge variant="secondary">Shift+]</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('shortcuts.selection.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.selection.selectRange')}</span>
                                        <Badge variant="secondary">Shift + Click</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.selection.toggleSelect')}</span>
                                        <Badge variant="secondary">Ctrl + Click</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('shortcuts.selection.extract')}</span>
                                        <ActionKey actionId={ACTIONS.EXTRACT_SEGMENT.id} />
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('shortcuts.selection.clear')}</span>
                                        <ActionKey actionId={ACTIONS.CLEAR_SELECTION.id} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* Tab 3: Common Tasks */}
                    <TabsContent value="tasks" className="space-y-3 mt-4">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            ✏️ {t('tasks.fixText.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.fixText.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            👤 {t('tasks.assignSpeaker.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.assignSpeaker.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            ✂️ {t('tasks.splitSegment.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.splitSegment.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            🔀 {t('tasks.moveUtterances.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.moveUtterances.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            ➕ {t('tasks.createSegment.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.createSegment.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            🔍 {t('tasks.findUnknown.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('tasks.findUnknown.answer')}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* Tab 4: Visual Indicators */}
                    <TabsContent value="visual" className="space-y-4 mt-4">
                        <Card className="border-l-4 border-l-green-500">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                                    {t('visual.userEdited.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.userEdited.description')}
                                </p>
                                <div className="mt-3 p-3 bg-slate-50 rounded border">
                                    <span className="underline decoration-green-500 decoration-2">
                                        {t('visual.userEdited.example')}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-blue-500">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                                    {t('visual.aiCorrected.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.aiCorrected.description')}
                                </p>
                                <div className="mt-3 p-3 bg-slate-50 rounded border">
                                    <span className="underline decoration-blue-500 decoration-2">
                                        {t('visual.aiCorrected.example')}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-slate-600">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-slate-600"></div>
                                    {t('visual.selected.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.selected.description')}
                                </p>
                                <div className="mt-3 p-3 bg-slate-50 rounded border">
                                    <span className="font-semibold">
                                        {t('visual.selected.example')}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

