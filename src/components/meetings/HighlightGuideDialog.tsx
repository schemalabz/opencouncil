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
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen } from 'lucide-react';

interface HighlightGuideDialogProps {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
}

export function HighlightGuideDialog({ children, onOpenChange }: HighlightGuideDialogProps) {
    const t = useTranslations('highlights.guide');

    return (
        <Dialog onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        {t('title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>
                
                <TabsPrimitive.Root defaultValue="quickstart" className="w-full flex-1 flex flex-col min-h-0">
                    <TabsPrimitive.List className="grid w-full grid-cols-4 flex-shrink-0 h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                        <TabsPrimitive.Trigger 
                            value="quickstart"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
                        >
                            {t('tabs.quickStart')}
                        </TabsPrimitive.Trigger>
                        <TabsPrimitive.Trigger 
                            value="selection"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
                        >
                            {t('tabs.selection')}
                        </TabsPrimitive.Trigger>
                        <TabsPrimitive.Trigger 
                            value="preview"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
                        >
                            {t('tabs.preview')}
                        </TabsPrimitive.Trigger>
                        <TabsPrimitive.Trigger 
                            value="visual"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
                        >
                            {t('tabs.visualGuide')}
                        </TabsPrimitive.Trigger>
                    </TabsPrimitive.List>
                    
                    {/* Tab 1: Quick Start */}
                    <TabsPrimitive.Content value="quickstart" className="space-y-4 mt-4 overflow-y-auto flex-1 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
                                <div className="flex gap-3">
                                    <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0">4</Badge>
                                    <p className="text-sm">{t('quickStart.workflow.step4')}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">{t('quickStart.creationMethods.title')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-start gap-2">
                                    <span className="text-amber-600 font-medium">1.</span>
                                    <span className="text-sm">{t('quickStart.creationMethods.headerButton')}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-amber-600 font-medium">2.</span>
                                    <span className="text-sm">{t('quickStart.creationMethods.contextMenu')}</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-amber-600 font-medium">3.</span>
                                    <span className="text-sm">{t('quickStart.creationMethods.listButton')}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsPrimitive.Content>
                    
                    {/* Tab 2: Selection */}
                    <TabsPrimitive.Content value="selection" className="space-y-4 mt-4 overflow-y-auto flex-1 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('selection.adding.title')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('selection.adding.clickToAdd')}</span>
                                        <Badge variant="secondary">{t('selection.adding.clickBadge')}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('selection.adding.clickToRemove')}</span>
                                        <Badge variant="secondary">{t('selection.adding.clickBadge')}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('selection.adding.selectRange')}</span>
                                        <Badge variant="secondary">{t('selection.adding.selectRangeBadge')}</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('selection.navigation.title')}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">{t('selection.navigation.subtitle')}</p>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('selection.navigation.previousClip')}</span>
                                        <Badge variant="secondary">{t('selection.navigation.previousButton')}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('selection.navigation.nextClip')}</span>
                                        <Badge variant="secondary">{t('selection.navigation.nextButton')}</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('selection.saving.title')}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">{t('selection.saving.subtitle')}</p>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('selection.saving.saveNow')}</span>
                                        <Badge variant="secondary">{t('selection.saving.saveButton')}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b">
                                        <span className="text-sm">{t('selection.saving.reset')}</span>
                                        <Badge variant="secondary">{t('selection.saving.resetButton')}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">{t('selection.saving.autoSave')}</span>
                                        <Badge variant="outline">{t('selection.saving.autoSaveBadge')}</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsPrimitive.Content>
                    
                    {/* Tab 3: Preview & Generate */}
                    <TabsPrimitive.Content value="preview" className="space-y-3 mt-4 overflow-y-auto flex-1 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Card>
                            <CardContent className="pt-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {t('previewTab.openPreview.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('previewTab.openPreview.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {t('previewTab.aspectRatio.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('previewTab.aspectRatio.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {t('previewTab.contentOptions.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('previewTab.contentOptions.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {t('previewTab.generate.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('previewTab.generate.answer')}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            {t('previewTab.editDetails.question')}
                                        </h4>
                                        <p className="text-sm text-muted-foreground pl-6">
                                            {t('previewTab.editDetails.answer')}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsPrimitive.Content>
                    
                    {/* Tab 4: Visual Indicators */}
                    <TabsPrimitive.Content value="visual" className="space-y-4 mt-4 overflow-y-auto flex-1 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <Card className="border-l-4 border-l-amber-500">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-amber-500"></div>
                                    {t('visual.selected.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.selected.description')}
                                </p>
                                <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200">
                                    <span className="font-bold underline">
                                        {t('visual.selected.example')}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-amber-400">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-8 rounded bg-amber-400"></div>
                                    {t('visual.timeline.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.timeline.description')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-red-500">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-red-500"></div>
                                    {t('visual.unsaved.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.unsaved.description')}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-l-4 border-l-slate-400">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <div className="h-3 w-3 rounded bg-slate-400"></div>
                                    {t('visual.modeBar.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {t('visual.modeBar.description')}
                                </p>
                            </CardContent>
                        </Card>
                    </TabsPrimitive.Content>
                </TabsPrimitive.Root>
            </DialogContent>
        </Dialog>
    );
}

