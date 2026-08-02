"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFindReplace } from './FindReplaceContext';
import { useCouncilMeetingData, useCouncilMeetingActions } from '../CouncilMeetingDataContext';
import { useTranscriptOptions } from '../options/OptionsContext';
import { editUtterance, replaceAllInUtterances } from '@/lib/db/utterance';
import { ChevronDown, ChevronUp, X, CaseSensitive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { literalReplaceAll } from '@/lib/utils/findReplace';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export function FindReplacePanel() {
    const fr = useFindReplace();
    const { options } = useTranscriptOptions();
    const { meeting, transcript } = useCouncilMeetingData();
    const { updateUtterance } = useCouncilMeetingActions();
    const { toast } = useToast();
    const t = useTranslations('transcript.findReplace');
    const searchInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);

    // Focus the requested input on open. If text was selected when Cmd+F was
    // pressed, the search box is pre-filled and we jump straight to the
    // replace input (Word-like UX). Depend on the specific fields used, not
    // the whole context object — otherwise every keystroke (which changes
    // `fr` identity) would re-fire focus().
    const { isOpen, pendingFocus, clearPendingFocus } = fr;
    useEffect(() => {
        if (!isOpen || !pendingFocus) return;
        const target = pendingFocus === 'replace' ? replaceInputRef.current : searchInputRef.current;
        target?.focus();
        target?.select();
        clearPendingFocus();
    }, [isOpen, pendingFocus, clearPendingFocus]);

    // Scroll the active match into view. Only scroll when the *active* match
    // actually changes — `fr.matches` identity churns on every search-term
    // keystroke, and scrolling on every keystroke makes typing jumpy.
    const lastScrolledMatchKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (!fr.isOpen) return;
        const active = fr.matches[fr.currentMatchIndex];
        if (!active) {
            lastScrolledMatchKeyRef.current = null;
            return;
        }
        const key = `${active.utteranceId}:${active.start}`;
        if (lastScrolledMatchKeyRef.current === key) return;
        lastScrolledMatchKeyRef.current = key;
        const el = document.getElementById(active.utteranceId);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [fr.isOpen, fr.matches, fr.currentMatchIndex]);

    const close = fr.close;

    // Local keyboard handling: ESC closes, Enter advances or replaces.
    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) fr.prevMatch();
            else fr.nextMatch();
        }
    }, [close, fr]);

    // Single-replace: substitute exactly one occurrence inside the utterance
    // containing the active match.
    const handleReplaceOne = useCallback(async () => {
        const active = fr.matches[fr.currentMatchIndex];
        if (!active) return;
        const segment = transcript.find(s => s.id === active.segmentId);
        const utterance = segment?.utterances.find(u => u.id === active.utteranceId);
        if (!utterance || !segment) return;
        const before = utterance.text;
        const newText = before.slice(0, active.start) + fr.replaceTerm + before.slice(active.end);
        try {
            await editUtterance(utterance.id, newText);
            updateUtterance(segment.id, utterance.id, { text: newText, lastModifiedBy: 'user' });
        } catch (err) {
            console.error(err);
            toast({ title: t('errorTitle'), description: t('errorReplaceOneFailed'), variant: 'destructive' });
        }
    }, [fr.matches, fr.currentMatchIndex, fr.replaceTerm, transcript, updateUtterance, toast, t]);

    // Replace-all: server-side batch, then locally rewrite each affected
    // utterance so the UI updates without a refetch.
    const handleReplaceAll = useCallback(async () => {
        if (!fr.searchTerm) return;
        setIsReplacing(true);
        try {
            const { utteranceCount, occurrenceCount } = await replaceAllInUtterances(
                meeting.cityId, meeting.id, fr.searchTerm, fr.replaceTerm, fr.caseSensitive,
            );

            if (occurrenceCount > 0) {
                for (const segment of transcript) {
                    for (const u of segment.utterances) {
                        if (!u.text) continue;
                        const { text: next, count } = literalReplaceAll(
                            u.text, fr.searchTerm, fr.replaceTerm, fr.caseSensitive,
                        );
                        if (count > 0 && next !== u.text) {
                            updateUtterance(segment.id, u.id, { text: next, lastModifiedBy: 'user' });
                        }
                    }
                }
            }

            toast({
                title: occurrenceCount === 1
                    ? t('toastTitleSingular', { count: occurrenceCount })
                    : t('toastTitlePlural', { count: occurrenceCount }),
                description: utteranceCount === 1
                    ? t('toastDescriptionSingular', { count: utteranceCount })
                    : t('toastDescriptionPlural', { count: utteranceCount }),
            });
        } catch (err) {
            console.error(err);
            toast({ title: t('errorTitle'), description: t('errorReplaceFailed'), variant: 'destructive' });
        } finally {
            setIsReplacing(false);
            setConfirmOpen(false);
        }
    }, [fr.searchTerm, fr.replaceTerm, fr.caseSensitive, meeting.cityId, meeting.id, transcript, updateUtterance, toast, t]);

    const total = fr.matches.length;
    const display = total === 0
        ? (fr.searchTerm ? t('noResults') : '')
        : t('counter', { current: fr.currentMatchIndex + 1, total });
    const disabled = !fr.searchTerm || total === 0;

    const panel = useMemo(() => (
        <div
            className={cn(
                'fixed z-40 right-4 top-20 w-80 rounded-lg border bg-background shadow-lg p-3 space-y-2',
            )}
            onKeyDown={onKeyDown}
            role="dialog"
            aria-label="Find and replace"
        >
            <div className="flex items-center gap-2">
                <Input
                    ref={searchInputRef}
                    placeholder={t('searchPlaceholder')}
                    value={fr.searchTerm}
                    onChange={(e) => fr.setSearchTerm(e.target.value)}
                    className="h-8 text-sm flex-1"
                />
                <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{display}</span>
            </div>
            <div className="flex items-center gap-2">
                <Input
                    ref={replaceInputRef}
                    placeholder={t('replacePlaceholder')}
                    value={fr.replaceTerm}
                    onChange={(e) => fr.setReplaceTerm(e.target.value)}
                    className="h-8 text-sm flex-1"
                />
            </div>
            <div className="flex items-center justify-between gap-1">
                <Button
                    type="button"
                    variant={fr.caseSensitive ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => fr.setCaseSensitive(!fr.caseSensitive)}
                    title={t('caseSensitive')}
                >
                    <CaseSensitive className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={fr.prevMatch}
                        disabled={disabled}
                        title={t('previous')}
                    >
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={fr.nextMatch}
                        disabled={disabled}
                        title={t('next')}
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleReplaceOne}
                        disabled={disabled}
                    >
                        {t('replaceOne')}
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setConfirmOpen(true)}
                        disabled={disabled || isReplacing}
                    >
                        {t('replaceAll')}
                    </Button>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={close}
                    title={t('close')}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    ), [onKeyDown, fr, display, disabled, isReplacing, handleReplaceOne, close, t]);

    if (!options.editable || !fr.isOpen) return null;

    return (
        <>
            {panel}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent align="start">
                    <DialogHeader>
                        <DialogTitle>{t('confirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('confirmDescription', { count: total, search: fr.searchTerm, replacement: fr.replaceTerm })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isReplacing}>{t('confirmCancel')}</Button>
                        <Button onClick={handleReplaceAll} disabled={isReplacing}>{t('confirmReplace')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
