"use client"

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { ExternalLink, Trash2, FileCheck, FileX, Loader2, Bot, UserIcon, Plus, X, Clock } from 'lucide-react';
import { DecisionWithSource } from '@/lib/db/decisions';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { getPollingHistoryForMeeting, requestPollDecisions } from '@/lib/tasks/pollDecisions';

type FilterTab = 'all' | 'unlinked';

interface ManualEntryState {
    pdfUrl: string;
    ada: string;
    protocolNumber: string;
    title: string;
}

interface FormErrors {
    pdfUrl?: string;
}

interface DecisionsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DecisionsPanel({ open, onOpenChange }: DecisionsPanelProps) {
    const { toast } = useToast();
    const { subjects, meeting } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const [decisions, setDecisions] = useState<Record<string, DecisionWithSource>>({});
    const [expandedManualEntry, setExpandedManualEntry] = useState<string | null>(null);
    const [editState, setEditState] = useState<ManualEntryState>({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
    const [removingSubjectId, setRemovingSubjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [pollingStatus, setPollingStatus] = useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    const fetchDecisions = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`);
            if (!response.ok) return;
            const data: DecisionWithSource[] = await response.json();
            const map: Record<string, DecisionWithSource> = {};
            for (const d of data) {
                map[d.subjectId] = d;
            }
            setDecisions(map);
        } catch {
            // silent
        } finally {
            setIsLoading(false);
        }
    }, [meeting.cityId, meeting.id]);

    useEffect(() => {
        if (open) {
            // Reset form state when dialog opens
            setExpandedManualEntry(null);
            setEditState({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
            setFormErrors({});
            setFilterTab('all');
            setPollingStatus(null);
            fetchDecisions();
            getPollingHistoryForMeeting(meeting.cityId, meeting.id)
                .then(setPollingStatus)
                .catch(() => { /* silent */ });
        }
    }, [open, fetchDecisions, meeting.cityId, meeting.id]);

    const validateForm = (): boolean => {
        const errors: FormErrors = {};

        if (!editState.pdfUrl.trim()) {
            errors.pdfUrl = t('decisions.validation.pdfUrlRequired');
        } else if (!editState.pdfUrl.startsWith('http://') && !editState.pdfUrl.startsWith('https://')) {
            errors.pdfUrl = t('decisions.validation.pdfUrlInvalid');
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async (subjectId: string) => {
        if (!validateForm()) return;

        setSavingSubjectId(subjectId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjectId,
                    pdfUrl: editState.pdfUrl,
                    ada: editState.ada || undefined,
                    protocolNumber: editState.protocolNumber || undefined,
                    title: editState.title || undefined,
                }),
            });

            if (!response.ok) throw new Error('Failed to save decision');

            await fetchDecisions();
            setExpandedManualEntry(null);
            setEditState({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
            toast({ title: t('toasts.decisionLinked.title') });
        } catch (error) {
            toast({ title: t('toasts.errorSavingDecision.title'), description: `${error}`, variant: 'destructive' });
        } finally {
            setSavingSubjectId(null);
        }
    };

    const handleRemove = async (subjectId: string) => {
        setRemovingSubjectId(subjectId);
        try {
            const response = await fetch(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions?subjectId=${subjectId}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error('Failed to remove decision');

            setDecisions(prev => {
                const next = { ...prev };
                delete next[subjectId];
                return next;
            });
            toast({ title: t('toasts.decisionUnlinked.title') });
        } catch (error) {
            toast({ title: t('toasts.errorRemovingDecision.title'), description: `${error}`, variant: 'destructive' });
        } finally {
            setRemovingSubjectId(null);
        }
    };

    const toggleManualEntry = (subjectId: string) => {
        if (expandedManualEntry === subjectId) {
            setExpandedManualEntry(null);
            setEditState({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
            setFormErrors({});
        } else {
            setExpandedManualEntry(subjectId);
            setEditState({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
            setFormErrors({});
        }
    };

    const updateEditState = (field: keyof ManualEntryState, value: string) => {
        setEditState(prev => ({ ...prev, [field]: value }));
        // Clear error for this field when user starts typing
        if (field === 'pdfUrl' && formErrors.pdfUrl) {
            setFormErrors(prev => ({ ...prev, pdfUrl: undefined }));
        }
    };

    const handlePollDecisions = async () => {
        setIsPolling(true);
        try {
            await requestPollDecisions(meeting.cityId, meeting.id);
            toast({ title: t('decisions.pollRequested') });
        } catch (error) {
            toast({
                title: t('decisions.pollError'),
                description: `${error}`,
                variant: 'destructive',
            });
        } finally {
            setIsPolling(false);
        }
    };

    // Only subjects with agendaItemIndex can have decisions
    const eligibleSubjects = subjects.filter(s => s.agendaItemIndex != null);
    const linkedCount = eligibleSubjects.filter(s => decisions[s.id]).length;
    const unlinkedSubjects = eligibleSubjects.filter(s => !decisions[s.id]);

    // Filter subjects based on selected tab
    const displayedSubjects = filterTab === 'unlinked'
        ? unlinkedSubjects
        : eligibleSubjects;

    // Helper to get source info for a decision
    const getSourceInfo = (decision: DecisionWithSource) => {
        if (decision.task) {
            return { type: 'task' as const, label: t('decisions.sourceTask') };
        } else if (decision.createdBy) {
            return { type: 'user' as const, label: decision.createdBy.name || decision.createdBy.email };
        }
        return null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {t('decisions.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('decisions.description')}
                    </DialogDescription>
                </DialogHeader>

                {/* Toolbar */}
                <div className="flex items-center justify-between border-b pb-3">
                    {/* Filter tabs */}
                    <div className="flex rounded-lg border p-0.5 bg-muted/50">
                        <button
                            onClick={() => setFilterTab('all')}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                filterTab === 'all'
                                    ? 'bg-background shadow-sm font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('decisions.tabAll')} ({eligibleSubjects.length})
                        </button>
                        <button
                            onClick={() => setFilterTab('unlinked')}
                            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                filterTab === 'unlinked'
                                    ? 'bg-background shadow-sm font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {t('decisions.tabUnlinked')} ({unlinkedSubjects.length})
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Linked count */}
                        <span className="text-xs text-muted-foreground">
                            <FileCheck className="h-3.5 w-3.5 inline mr-1" />
                            {linkedCount}/{eligibleSubjects.length}
                        </span>

                        {/* Poll button */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={isPolling}
                            onClick={handlePollDecisions}
                        >
                            {isPolling ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : null}
                            {t('decisions.pollButton')}
                        </Button>
                    </div>
                </div>

                {/* Polling Status */}
                {pollingStatus && pollingStatus.totalPolls > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <Clock className="h-3 w-3" />
                        <span>
                            Polled {pollingStatus.totalPolls} {pollingStatus.totalPolls === 1 ? 'time' : 'times'}
                        </span>
                        {pollingStatus.firstPollAt && (
                            <>
                                <span>&middot;</span>
                                <span>started {new Date(pollingStatus.firstPollAt).toLocaleDateString()}</span>
                            </>
                        )}
                        {pollingStatus.currentTierLabel && (
                            <>
                                <span>&middot;</span>
                                <span>{pollingStatus.currentTierLabel}</span>
                            </>
                        )}
                        {pollingStatus.nextPollEligible ? (
                            <>
                                <span>&middot;</span>
                                <span>Next auto-poll: {new Date(pollingStatus.nextPollEligible).toLocaleDateString()}</span>
                            </>
                        ) : pollingStatus.currentTierLabel?.startsWith('Stopped') ? (
                            <>
                                <span>&middot;</span>
                                <span>Automatic polling stopped</span>
                            </>
                        ) : null}
                    </div>
                )}

                {/* Subjects List */}
                <div className="space-y-1 py-2">
                    {isLoading ? (
                        <div className="p-8 flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : displayedSubjects.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {filterTab === 'unlinked' ? t('decisions.allLinked') : t('decisions.noSubjects')}
                        </div>
                    ) : (
                        <TooltipProvider>
                            {displayedSubjects.map(subject => {
                                const decision = decisions[subject.id];
                                const sourceInfo = decision ? getSourceInfo(decision) : null;
                                const isExpanded = expandedManualEntry === subject.id;
                                const isSaving = savingSubjectId === subject.id;
                                const isRemoving = removingSubjectId === subject.id;

                                return (
                                    <div
                                        key={subject.id}
                                        className="py-3 border-b last:border-b-0"
                                    >
                                        {/* Main row */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-gray-900 break-words">
                                                    {subject.agendaItemIndex != null && (
                                                        <span className="text-muted-foreground mr-1">#{subject.agendaItemIndex}</span>
                                                    )}
                                                    {subject.name}
                                                </div>
                                                {/* Decision title - secondary, discreet */}
                                                {decision?.title && (
                                                    <div className="text-xs text-muted-foreground mt-0.5 break-words">
                                                        {decision.title}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {decision ? (
                                                    <>
                                                        {sourceInfo && (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span className="text-muted-foreground">
                                                                        {sourceInfo.type === 'task' ? (
                                                                            <Bot className="h-4 w-4" />
                                                                        ) : (
                                                                            <UserIcon className="h-4 w-4" />
                                                                        )}
                                                                    </span>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    {sourceInfo.label}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                        <Badge variant="default" className="bg-green-600 text-xs">
                                                            <FileCheck className="h-3 w-3 mr-1" />
                                                            {decision.ada || decision.protocolNumber || t('decisions.linked')}
                                                        </Badge>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <a
                                                                    href={decision.pdfUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-muted-foreground hover:text-foreground"
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                </a>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{t('decisions.viewPdf')}</TooltipContent>
                                                        </Tooltip>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    onClick={() => handleRemove(subject.id)}
                                                                    disabled={isRemoving}
                                                                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                                                >
                                                                    {isRemoving ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Trash2 className="h-4 w-4" />
                                                                    )}
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>{t('decisions.remove')}</TooltipContent>
                                                        </Tooltip>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Badge variant="secondary" className="text-xs">
                                                            <FileX className="h-3 w-3 mr-1" />
                                                            {t('decisions.noDecision')}
                                                        </Badge>
                                                        <button
                                                            onClick={() => toggleManualEntry(subject.id)}
                                                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                                        >
                                                            {isExpanded ? (
                                                                <X className="h-3 w-3" />
                                                            ) : (
                                                                <Plus className="h-3 w-3" />
                                                            )}
                                                            {t('decisions.addManually')}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Manual entry form - expandable */}
                                        {isExpanded && (
                                            <div className="mt-3 pl-4 border-l-2 border-muted space-y-3">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">{t('decisions.adaLabel')}</Label>
                                                        <Input
                                                            placeholder={t('decisions.adaPlaceholder')}
                                                            value={editState.ada}
                                                            onChange={e => updateEditState('ada', e.target.value)}
                                                            className="text-sm h-8"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">{t('decisions.protocolNumberLabel')}</Label>
                                                        <Input
                                                            placeholder={t('decisions.protocolNumberPlaceholder')}
                                                            value={editState.protocolNumber}
                                                            onChange={e => updateEditState('protocolNumber', e.target.value)}
                                                            className="text-sm h-8"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">{t('decisions.titleLabel')}</Label>
                                                    <Input
                                                        placeholder={t('decisions.titlePlaceholder')}
                                                        value={editState.title}
                                                        onChange={e => updateEditState('title', e.target.value)}
                                                        className="text-sm h-8"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">{t('decisions.pdfUrlLabel')} *</Label>
                                                    <LinkOrDrop
                                                        placeholder={t('decisions.pdfUrlPlaceholder')}
                                                        value={editState.pdfUrl}
                                                        onChange={e => updateEditState('pdfUrl', e.target.value)}
                                                        onUrlChange={url => updateEditState('pdfUrl', url)}
                                                        config={{
                                                            cityId: meeting.cityId,
                                                            identifier: `${meeting.id}_${subject.id}`,
                                                            suffix: 'decision',
                                                        }}
                                                        className={`text-sm h-8 ${formErrors.pdfUrl ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                                    />
                                                    {formErrors.pdfUrl && (
                                                        <p className="text-xs text-destructive">{formErrors.pdfUrl}</p>
                                                    )}
                                                </div>
                                                <div className="flex justify-end">
                                                    <Button
                                                        size="sm"
                                                        className="h-8"
                                                        disabled={isSaving}
                                                        onClick={() => handleSave(subject.id)}
                                                    >
                                                        {isSaving ? (
                                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                        ) : null}
                                                        {t('decisions.save')}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </TooltipProvider>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
