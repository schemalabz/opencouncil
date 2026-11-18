"use client";
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dayInputValue, rosterDateRequest } from '@/lib/utils/rosterDates';

interface MembershipEndDialogProps {
    title: string;
    description: string;
    busy: boolean;
    /** The end date to send: undefined when the admin kept today, so the server ends the memberships now. */
    onConfirm: (endDate: string | undefined) => void;
    onClose: () => void;
}

/**
 * Asks the day that a membership, or the term of every member, ends (#829).
 * The default is today. A secretary who acts weeks after the change gives
 * the real day, so the meetings in between keep the right roster. A day
 * after today is not offered, and the server refuses it.
 */
export function MembershipEndDialog({ title, description, busy, onConfirm, onClose }: MembershipEndDialogProps) {
    const t = useTranslations('body');
    const inputId = useId();
    const [today] = useState(() => dayInputValue(new Date()));
    const [day, setDay] = useState(today);

    return (
        <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor={inputId}>{t('endDateLabel')}</Label>
                    <Input id={inputId} type="date" required max={today} value={day} onChange={event => setDay(event.target.value)} disabled={busy} />
                    <p className="text-xs text-muted-foreground">{t('endDateHint')}</p>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                        {t('cancel')}
                    </Button>
                    <Button type="button" onClick={() => onConfirm(rosterDateRequest(day, today))} disabled={busy || !day}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {title}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
