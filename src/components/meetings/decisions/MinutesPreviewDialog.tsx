"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { MinutesData } from '@/lib/minutes/types';
import { MinutesPreviewContent } from '@/components/meetings/admin/MinutesPreviewContent';

/** The rendered minutes, as the DOCX will print them. The page owns the data; this only shows it. */
export function MinutesPreviewDialog({ open, onOpenChange, data }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: MinutesData;
    /** Required: a default is what once let a superadmin-only control reach no one. */
    isSuperAdmin: boolean;
}) {
    const { meeting } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const [debugMode, setDebugMode] = React.useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent align="start" className="max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('minutes.title')}</DialogTitle>
                    <div className="flex items-center justify-between">
                        <DialogDescription>{meeting.name}</DialogDescription>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer shrink-0 ml-4">
                            <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} />
                            Debug: Show classification
                        </label>
                    </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto min-h-0">
                    <MinutesPreviewContent data={data} debugMode={debugMode} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
