"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { MinutesData } from '@/lib/minutes/types';
import { MinutesPreviewContent } from '@/components/meetings/admin/MinutesPreviewContent';

/** The rendered minutes, as the DOCX will print them. The page owns the data; this only shows it.
 *
 * A superadmin also gets the provenance of what they are reading: whether the
 * arrivals and departures are the ones the documents state or a reconstruction
 * from per-subject attendance, and how much the derivation could not settle. */
export function MinutesPreviewDialog({ open, onOpenChange, data, isSuperAdmin = false, issueCount = 0, onShowIssues }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: MinutesData;
    isSuperAdmin?: boolean;
    issueCount?: number;
    /** Closes the dialog on the page's issues filter; without it the count is plain text. */
    onShowIssues?: () => void;
}) {
    const { meeting } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
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
                {isSuperAdmin && (
                    <div className="shrink-0 border-t pt-2 text-xs text-muted-foreground">
                        {data.attendanceChangesSource === 'events' ? tPage('changesFromEvents') : tPage('changesFromDiff')}
                        {' · '}
                        {onShowIssues ? (
                            <button type="button" className="underline hover:text-foreground"
                                onClick={() => { onOpenChange(false); onShowIssues(); }}>
                                {tPage('issues.count', { n: issueCount })}
                            </button>
                        ) : tPage('issues.count', { n: issueCount })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
