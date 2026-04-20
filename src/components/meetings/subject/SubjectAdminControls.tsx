"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { JsonMetadataDialog } from "@/components/ui/json-metadata-dialog";
import { getWithdrawnLabel } from "@/lib/utils/subjects";
import { FileJson } from "lucide-react";

interface SubjectAdminControlsProps {
    subject: {
        id: string;
        nonAgendaReason: string | null;
        withdrawn: boolean;
        [key: string]: unknown;
    };
    cityId: string;
    meetingId: string;
}

export function SubjectAdminControls({ subject, cityId, meetingId }: SubjectAdminControlsProps) {
    const [open, setOpen] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const updateSubject = useCallback(async (fields: { nonAgendaReason?: string | null; withdrawn?: boolean }) => {
        setIsUpdating(true);
        try {
            const res = await fetch(
                `/api/cities/${cityId}/meetings/${meetingId}/subjects/${subject.id}`,
                { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }
            );
            if (!res.ok) {
                const err = await res.json();
                console.error('Failed to update subject:', err.error);
                return;
            }
            setOpen(false);
            window.location.reload();
        } finally {
            setIsUpdating(false);
        }
    }, [cityId, meetingId, subject.id]);

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            >
                <FileJson className="h-4 w-4" />
            </Button>

            <JsonMetadataDialog
                open={open}
                onOpenChange={setOpen}
                title="Subject Metadata"
                data={subject}
                footerActions={
                    <div className="flex items-center gap-4 mr-auto">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="nonAgendaReason" className="text-xs text-muted-foreground whitespace-nowrap">Category</Label>
                            <Select
                                value={subject.nonAgendaReason ?? 'agenda'}
                                onValueChange={(value) => updateSubject({
                                    nonAgendaReason: value === 'agenda' ? null : value,
                                })}
                                disabled={isUpdating}
                            >
                                <SelectTrigger id="nonAgendaReason" className="h-7 w-[160px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="agenda">Ημερησίας</SelectItem>
                                    <SelectItem value="beforeAgenda">Προ ημερησίας</SelectItem>
                                    <SelectItem value="outOfAgenda">Εκτός ημερησίας</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="withdrawn" className="text-xs text-muted-foreground">{getWithdrawnLabel(subject)}</Label>
                            <Switch
                                id="withdrawn"
                                checked={subject.withdrawn}
                                onCheckedChange={(checked) => updateSubject({ withdrawn: checked })}
                                disabled={isUpdating}
                            />
                        </div>
                    </div>
                }
            />
        </>
    );
}
