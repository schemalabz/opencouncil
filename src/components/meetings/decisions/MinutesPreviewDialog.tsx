"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { MinutesData } from '@/lib/minutes/types';
import { MinutesPreviewContent } from '@/components/meetings/admin/MinutesPreviewContent';
import { AdminOnly } from '@/components/admin/AdminStrip';

/** The rendered minutes, as the DOCX will print them. The page owns the data; this only shows it.
 * A superadmin also gets the transcript classification overlay, framed as theirs alone. */
export function MinutesPreviewDialog({ open, onOpenChange, data, isSuperAdmin }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: MinutesData;
    /** Required: a default is what once let a superadmin-only control reach no one. */
    isSuperAdmin: boolean;
}) {
    const { meeting } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
    const tCommon = useTranslations('Common');
    const [debugMode, setDebugMode] = React.useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent align="start" className="max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('minutes.title')}</DialogTitle>
                    <div className="flex items-center justify-between">
                        <DialogDescription>{meeting.name}</DialogDescription>
                        {isSuperAdmin && (
                            <AdminOnly label={tCommon('adminOnly')} className="shrink-0 ml-4">
                                <label className="flex items-center gap-2 rounded-lg bg-background px-2 py-1 text-xs text-muted-foreground cursor-pointer">
                                    <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} />
                                    {tPage('debugClassification')}
                                </label>
                            </AdminOnly>
                        )}
                    </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto min-h-0">
                    <MinutesPreviewContent data={data} debugMode={debugMode} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
