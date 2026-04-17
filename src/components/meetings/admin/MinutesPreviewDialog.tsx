"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FileDown } from 'lucide-react';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { downloadFile } from '@/lib/export/meetings';
import { MinutesData } from '@/lib/minutes/types';
import { MinutesPreviewContent } from './MinutesPreviewContent';

interface MinutesPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type PreviewState = 'idle' | 'loading' | 'ready' | 'error';

export function MinutesPreviewDialog({ open, onOpenChange }: MinutesPreviewDialogProps) {
    const { meeting, city } = useCouncilMeetingData();
    const { toast } = useToast();
    const t = useTranslations('admin.adminActions');
    const [state, setState] = React.useState<PreviewState>('idle');
    const [data, setData] = React.useState<MinutesData | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) {
            setState('idle');
            setData(null);
            setError(null);
            return;
        }

        let cancelled = false;

        async function loadPreview() {
            setState('loading');
            try {
                const response = await fetch(
                    `/api/cities/${meeting.cityId}/meetings/${meeting.id}/minutes?format=json`
                );
                if (!response.ok) {
                    throw new Error(`Failed to fetch minutes: ${response.statusText}`);
                }
                const minutesData: MinutesData = await response.json();

                if (cancelled) return;
                setData(minutesData);
                setState('ready');
            } catch (err) {
                if (cancelled) return;
                console.error('Error loading minutes preview:', err);
                setState('error');
                setError(err instanceof Error ? err.message : 'Unknown error');
            }
        }

        loadPreview();

        return () => {
            cancelled = true;
        };
    }, [open, meeting.cityId, meeting.id]);

    const handleExport = async () => {
        try {
            const response = await fetch(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/minutes`
            );
            if (!response.ok) {
                throw new Error(`Failed to fetch DOCX: ${response.statusText}`);
            }
            const blob = await response.blob();
            const fileName = `minutes-${city.id}-${meeting.id}.docx`;
            downloadFile(blob, fileName);
            toast({ title: t('minutes.exportSuccess') });
        } catch (err) {
            console.error('Error exporting minutes:', err);
            toast({ title: t('minutes.exportError'), variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t('minutes.title')}</DialogTitle>
                    <DialogDescription>{meeting.name}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {state === 'loading' && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            <span className="ml-3 text-muted-foreground">
                                {t('minutes.loading')}
                            </span>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            {error}
                        </div>
                    )}

                    {state === 'ready' && data && (
                        <MinutesPreviewContent data={data} />
                    )}
                </div>

                {state === 'ready' && data && (
                    <div className="border-t pt-3 flex justify-end">
                        <Button onClick={handleExport}>
                            <FileDown className="w-4 h-4 mr-2" />
                            {t('buttons.exportMinutesDocx')}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
