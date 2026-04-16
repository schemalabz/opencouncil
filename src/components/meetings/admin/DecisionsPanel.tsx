"use client"

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { ExternalLink, Trash2, FileCheck, FileX, Loader2, Bot, UserIcon, Plus, X, Clock, ChevronRight, ChevronDown, Users, Vote, Eraser, Search } from 'lucide-react';
import { DecisionWithSource, SubjectExtractedData } from '@/lib/db/decisions';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { getPollingHistoryForMeeting, requestPollDecisions } from '@/lib/tasks/pollDecisions';
import { calculateVoteResult } from '@/lib/utils/votes';
import { getWithdrawnLabel } from '@/lib/utils/subjects';
import ReactMarkdown from 'react-markdown';

type FilterTab = 'all' | 'unlinked' | 'extracted';

interface ManualEntryState {
    pdfUrl: string;
    ada: string;
    protocolNumber: string;
    title: string;
}

interface FormErrors {
    ada?: string;
    pdfUrl?: string;
}

interface DecisionsPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function CollapsibleMarkdown({ content, showMoreLabel, showLessLabel }: {
    content: string;
    showMoreLabel: string;
    showLessLabel: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const isLong = content.length > 300;
    return (
        <div>
            <div className={isLong && !expanded ? 'max-h-24 overflow-hidden relative' : ''}>
                <div className="prose prose-xs max-w-none text-xs [&_p]:mb-1.5 [&_p]:leading-relaxed [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc [&_li]:mb-0.5">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
                {isLong && !expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
                )}
            </div>
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-primary hover:underline text-xs mt-1"
                >
                    {expanded ? showLessLabel : showMoreLabel}
                </button>
            )}
        </div>
    );
}

function NameList({ names, label }: { names: string[]; label: string }) {
    const [expanded, setExpanded] = useState(false);
    if (names.length === 0) return null;
    return (
        <span>
            <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {label}
            </button>
            {expanded && (
                <span className="block text-xs text-muted-foreground mt-1 ml-4">
                    {names.join(', ')}
                </span>
            )}
        </span>
    );
}

export function DecisionsPanel({ open, onOpenChange }: DecisionsPanelProps) {
    const { toast } = useToast();
    const { subjects, meeting } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const [decisions, setDecisions] = useState<Record<string, DecisionWithSource>>({});
    const [extractedData, setExtractedData] = useState<Record<string, SubjectExtractedData>>({});
    const [expandedManualEntry, setExpandedManualEntry] = useState<string | null>(null);
    const [expandedExtracted, setExpandedExtracted] = useState<string | null>(null);
    const [editState, setEditState] = useState<ManualEntryState>({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
    const [removingSubjectId, setRemovingSubjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [pollingStatus, setPollingStatus] = useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [forceExtract, setForceExtract] = useState(false);

    const fetchDecisions = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`);
            if (!response.ok) return;
            const data: { decisions: DecisionWithSource[]; extractedData: SubjectExtractedData[] } = await response.json();
            const decisionMap: Record<string, DecisionWithSource> = {};
            for (const d of data.decisions) {
                decisionMap[d.subjectId] = d;
            }
            setDecisions(decisionMap);
            const extractedMap: Record<string, SubjectExtractedData> = {};
            for (const e of data.extractedData) {
                extractedMap[e.subjectId] = e;
            }
            setExtractedData(extractedMap);
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
            setExpandedExtracted(null);
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

        if (!showMoreOptions) {
            // ADA-only mode: ADA is required, pdfUrl is auto-derived
            if (!editState.ada.trim()) {
                errors.ada = t('decisions.validation.adaRequired');
            }
        } else {
            // More options mode: need ADA or a manual pdfUrl
            if (!editState.ada.trim() && !editState.pdfUrl.trim()) {
                errors.ada = t('decisions.validation.adaRequired');
            }
            if (editState.pdfUrl.trim() && !editState.pdfUrl.startsWith('http://') && !editState.pdfUrl.startsWith('https://')) {
                errors.pdfUrl = t('decisions.validation.pdfUrlInvalid');
            }
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async (subjectId: string) => {
        if (!validateForm()) return;

        const ada = editState.ada.trim();
        const effectivePdfUrl = editState.pdfUrl.trim() || `https://diavgeia.gov.gr/doc/${encodeURIComponent(ada)}`;

        setSavingSubjectId(subjectId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjectId,
                    pdfUrl: effectivePdfUrl,
                    ada: ada || undefined,
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
            setShowMoreOptions(false);
        } else {
            setExpandedManualEntry(subjectId);
            setEditState({ pdfUrl: '', ada: '', protocolNumber: '', title: '' });
            setFormErrors({});
            setShowMoreOptions(false);
        }
    };

    const toggleExtracted = (subjectId: string) => {
        setExpandedExtracted(prev => prev === subjectId ? null : subjectId);
    };

    const updateEditState = (field: keyof ManualEntryState, value: string) => {
        setEditState(prev => ({ ...prev, [field]: value }));
        // Clear error for this field when user starts typing
        if (field === 'pdfUrl' && formErrors.pdfUrl) {
            setFormErrors(prev => ({ ...prev, pdfUrl: undefined }));
        }
        if (field === 'ada' && formErrors.ada) {
            setFormErrors(prev => ({ ...prev, ada: undefined }));
        }
    };

    const handlePollDecisions = async () => {
        setIsPolling(true);
        try {
            await requestPollDecisions(meeting.cityId, meeting.id, forceExtract ? { forceExtract: true } : undefined);
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

    const handleClearExtractedData = async () => {
        if (!confirm('Clear all extracted data (excerpts, attendance, votes) for this meeting? Decision links will be kept.')) return;
        setIsClearing(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearExtractedData' }),
            });
            if (!response.ok) throw new Error('Failed to clear extracted data');
            const result = await response.json();
            toast({ title: `Cleared extracted data for ${result.clearedCount} decisions` });
            await fetchDecisions();
        } catch (error) {
            toast({ title: 'Error clearing extracted data', description: `${error}`, variant: 'destructive' });
        } finally {
            setIsClearing(false);
        }
    };

    // Subjects eligible for decisions: agenda items + outOfAgenda, in display order.
    // Use nonAgendaReason as the primary discriminator — agendaItemIndex alone is not
    // sufficient because outOfAgenda subjects may also have an agendaItemIndex from PDF data.
    // beforeAgenda subjects are excluded (pre-agenda announcements without decisions).
    const agendaSubjects = subjects
        .filter(s => s.agendaItemIndex != null && s.nonAgendaReason === null)
        .sort((a, b) => a.agendaItemIndex! - b.agendaItemIndex!);
    const outOfAgendaSubjects = subjects
        .filter(s => s.nonAgendaReason === 'outOfAgenda');
    const allDisplaySubjects = [...agendaSubjects, ...outOfAgendaSubjects];
    const eligibleSubjects = allDisplaySubjects.filter(s => !s.withdrawn);
    const linkedCount = eligibleSubjects.filter(s => decisions[s.id]).length;
    const unlinkedSubjects = eligibleSubjects.filter(s => !decisions[s.id]);
    const extractedSubjects = eligibleSubjects.filter(s => {
        const decision = decisions[s.id];
        return (decision?.excerpt) || extractedData[s.id];
    });

    // Filter subjects based on selected tab
    const displayedSubjects = filterTab === 'unlinked'
        ? unlinkedSubjects
        : filterTab === 'extracted'
            ? extractedSubjects
            : allDisplaySubjects;

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

                {/* Actions */}
                <div className="space-y-3 border-b pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div>
                                <div className="text-xs font-medium">Poll &amp; extract decisions</div>
                                <div className="text-[11px] text-muted-foreground">
                                    Poll Diavgeia, match decisions to subjects, and extract data from PDFs.
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                                <FileCheck className="h-3.5 w-3.5 inline mr-1" />
                                {linkedCount}/{eligibleSubjects.length}
                            </span>
                            {extractedSubjects.length > 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={isClearing}
                                    onClick={handleClearExtractedData}
                                >
                                    {isClearing ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                        <Eraser className="h-3 w-3 mr-1" />
                                    )}
                                    Clear
                                </Button>
                            )}
                            <div className="flex items-center gap-1.5">
                                <Checkbox
                                    id="force-extract"
                                    checked={forceExtract}
                                    onCheckedChange={(checked) => setForceExtract(checked === true)}
                                    className="h-3.5 w-3.5"
                                />
                                <Label htmlFor="force-extract" className="text-[11px] text-muted-foreground cursor-pointer">
                                    Force extract
                                </Label>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={isPolling}
                                onClick={handlePollDecisions}
                            >
                                {isPolling ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                    <Search className="h-3 w-3 mr-1" />
                                )}
                                {t('decisions.pollButton')}
                            </Button>
                        </div>
                    </div>

                    {/* Polling Status */}
                    {pollingStatus && pollingStatus.totalPolls > 0 && (
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
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
                </div>

                {/* Filter tabs */}
                <div className="flex rounded-lg border p-0.5 bg-muted/50 self-start">
                    <button
                        onClick={() => setFilterTab('all')}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                            filterTab === 'all'
                                ? 'bg-background shadow-sm font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t('decisions.tabAll')} ({allDisplaySubjects.length})
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
                    <button
                        onClick={() => setFilterTab('extracted')}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                            filterTab === 'extracted'
                                ? 'bg-background shadow-sm font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t('decisions.tabExtracted')} ({extractedSubjects.length})
                    </button>
                </div>

                {/* Subjects List */}
                <div className="space-y-1 py-2">
                    {isLoading ? (
                        <div className="p-8 flex justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : displayedSubjects.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {filterTab === 'unlinked'
                                ? t('decisions.allLinked')
                                : filterTab === 'extracted'
                                    ? t('decisions.noExtractedData')
                                    : t('decisions.noSubjects')}
                        </div>
                    ) : (
                        <TooltipProvider>
                            {displayedSubjects.map((subject, index) => {
                                const decision = decisions[subject.id];
                                const extracted = extractedData[subject.id];
                                const sourceInfo = decision ? getSourceInfo(decision) : null;
                                const isManualExpanded = expandedManualEntry === subject.id;
                                const hasExtractedContent = (decision?.excerpt) || extracted;
                                const isExtractedExpanded = expandedExtracted === subject.id;
                                const isSaving = savingSubjectId === subject.id;
                                const isRemoving = removingSubjectId === subject.id;

                                const showOutOfAgendaSeparator = subject.nonAgendaReason === 'outOfAgenda' &&
                                    (index === 0 || displayedSubjects[index - 1].nonAgendaReason !== 'outOfAgenda');

                                return (
                                    <Fragment key={subject.id}>
                                        {showOutOfAgendaSeparator && (
                                            <div className="pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                Εκτός Ημ. Διάταξης
                                            </div>
                                        )}
                                    <div
                                        className="py-3 border-b last:border-b-0"
                                    >
                                        {/* Main row */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0 flex items-start gap-2">
                                                {/* Expand chevron for linked decisions with extracted data */}
                                                {decision && hasExtractedContent ? (
                                                    <button
                                                        onClick={() => toggleExtracted(subject.id)}
                                                        className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
                                                    >
                                                        {isExtractedExpanded
                                                            ? <ChevronDown className="h-4 w-4" />
                                                            : <ChevronRight className="h-4 w-4" />}
                                                    </button>
                                                ) : (
                                                    <span className="w-4 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className={`font-medium text-sm break-words ${subject.withdrawn ? 'text-muted-foreground' : 'text-gray-900'}`}>
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
                                                    {/* Inline attendance & vote summary */}
                                                    {extracted && (extracted.attendance.length > 0 || extracted.votes.length > 0) && (() => {
                                                        const present = extracted.attendance.filter(a => a.status === 'PRESENT');
                                                        const absent = extracted.attendance.filter(a => a.status === 'ABSENT');
                                                        const voteResult = extracted.votes.length > 0 ? calculateVoteResult(extracted.votes) : null;
                                                        return (
                                                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                                {extracted.attendance.length > 0 && (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Users className="h-3 w-3" />
                                                                        {present.length}/{absent.length}
                                                                    </span>
                                                                )}
                                                                {voteResult && (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Vote className="h-3 w-3" />
                                                                        {voteResult.isUnanimous
                                                                            ? t('decisions.unanimous', { count: voteResult.forCount })
                                                                            : voteResult.passed
                                                                                ? t('decisions.majorityVote', { for: voteResult.forCount, against: voteResult.againstCount })
                                                                                : t('decisions.rejected', { against: voteResult.againstCount, for: voteResult.forCount })}
                                                                        {!voteResult.isUnanimous && voteResult.abstainCount > 0 &&
                                                                            `, ${voteResult.abstainCount} ${t('decisions.voteAbstain')}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {subject.withdrawn ? (
                                                    <Badge variant="secondary" className="text-xs text-muted-foreground italic">
                                                        {getWithdrawnLabel(subject)}
                                                    </Badge>
                                                ) : decision ? (
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
                                                            {isManualExpanded ? (
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

                                        {/* Extracted data panel - expandable for linked decisions */}
                                        {isExtractedExpanded && hasExtractedContent && (
                                            <div className="mt-3 ml-6 pl-4 border-l-2 border-muted space-y-3">
                                                {/* Excerpt */}
                                                {decision?.excerpt && (
                                                    <div>
                                                        <div className="text-xs font-medium text-muted-foreground mb-1">
                                                            {t('decisions.excerpt')}
                                                        </div>
                                                        <CollapsibleMarkdown
                                                            content={decision.excerpt}
                                                            showMoreLabel={t('decisions.showMore')}
                                                            showLessLabel={t('decisions.showLess')}
                                                        />
                                                    </div>
                                                )}

                                                {/* References */}
                                                {decision?.references && (
                                                    <div>
                                                        <div className="text-xs font-medium text-muted-foreground mb-1">
                                                            {t('decisions.references')}
                                                        </div>
                                                        <CollapsibleMarkdown
                                                            content={decision.references}
                                                            showMoreLabel={t('decisions.showMore')}
                                                            showLessLabel={t('decisions.showLess')}
                                                        />
                                                    </div>
                                                )}

                                                {/* Attendance */}
                                                {extracted && extracted.attendance.length > 0 && (() => {
                                                    const present = extracted.attendance.filter(a => a.status === 'PRESENT');
                                                    const absent = extracted.attendance.filter(a => a.status === 'ABSENT');
                                                    return (
                                                        <div>
                                                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                                                {t('decisions.attendance')}
                                                            </div>
                                                            <div className="text-xs text-foreground space-y-1">
                                                                <span>
                                                                    {present.length} {t('decisions.present')}, {absent.length} {t('decisions.absent')}
                                                                </span>
                                                                <div className="flex flex-col gap-1">
                                                                    {present.length > 0 && (
                                                                        <NameList
                                                                            names={present.map(a => a.personName)}
                                                                            label={`${t('decisions.showNames')} (${t('decisions.present')})`}
                                                                        />
                                                                    )}
                                                                    {absent.length > 0 && (
                                                                        <NameList
                                                                            names={absent.map(a => a.personName)}
                                                                            label={`${t('decisions.showNames')} (${t('decisions.absent')})`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Votes */}
                                                {extracted && extracted.votes.length > 0 && (() => {
                                                    const voteResult = calculateVoteResult(extracted.votes);
                                                    return (
                                                        <div>
                                                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                                                {t('decisions.votes')}
                                                            </div>
                                                            <div className="text-xs text-foreground space-y-1">
                                                                <span>
                                                                    {voteResult.isUnanimous
                                                                        ? t('decisions.unanimous', { count: voteResult.forCount })
                                                                        : voteResult.passed
                                                                            ? t('decisions.majorityVote', { for: voteResult.forCount, against: voteResult.againstCount })
                                                                            : t('decisions.rejected', { against: voteResult.againstCount, for: voteResult.forCount })}
                                                                    {!voteResult.isUnanimous && voteResult.abstainCount > 0 &&
                                                                        `, ${voteResult.abstainCount} ${t('decisions.voteAbstain')}`}
                                                                </span>
                                                                {!voteResult.isUnanimous && (
                                                                    <div className="flex flex-col gap-1">
                                                                        <NameList
                                                                            names={extracted.votes.filter(v => v.voteType === 'FOR').map(v => v.personName)}
                                                                            label={`${t('decisions.showNames')} (${voteResult.forCount} ${t('decisions.voteFor')})`}
                                                                        />
                                                                        <NameList
                                                                            names={extracted.votes.filter(v => v.voteType === 'AGAINST').map(v => v.personName)}
                                                                            label={`${t('decisions.showNames')} (${voteResult.againstCount} ${t('decisions.voteAgainst')})`}
                                                                        />
                                                                        {voteResult.abstainCount > 0 && (
                                                                            <NameList
                                                                                names={extracted.votes.filter(v => v.voteType === 'ABSTAIN').map(v => v.personName)}
                                                                                label={`${t('decisions.showNames')} (${voteResult.abstainCount} ${t('decisions.voteAbstain')})`}
                                                                            />
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Manual entry form - expandable */}
                                        {isManualExpanded && (
                                            <div className="mt-3 pl-4 border-l-2 border-muted space-y-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-muted-foreground">{t('decisions.adaLabel')} *</Label>
                                                    <Input
                                                        placeholder={t('decisions.adaPlaceholder')}
                                                        value={editState.ada}
                                                        onChange={e => updateEditState('ada', e.target.value)}
                                                        className={`text-sm h-8 ${formErrors.ada ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                                    />
                                                    {formErrors.ada && (
                                                        <p className="text-xs text-destructive">{formErrors.ada}</p>
                                                    )}
                                                    {!showMoreOptions && editState.ada.trim() && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {t('decisions.autoPdfHint', { ada: editState.ada.trim() })}
                                                        </p>
                                                    )}
                                                </div>

                                                <button
                                                    type="button"
                                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                    onClick={() => setShowMoreOptions(prev => !prev)}
                                                >
                                                    {showMoreOptions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                                    {t('decisions.moreOptions')}
                                                </button>

                                                {showMoreOptions && (
                                                    <div className="space-y-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-muted-foreground">{t('decisions.pdfUrlLabel')}</Label>
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
                                                            <Label className="text-xs text-muted-foreground">{t('decisions.protocolNumberLabel')}</Label>
                                                            <Input
                                                                placeholder={t('decisions.protocolNumberPlaceholder')}
                                                                value={editState.protocolNumber}
                                                                onChange={e => updateEditState('protocolNumber', e.target.value)}
                                                                className="text-sm h-8"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

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
                                    </Fragment>
                                );
                            })}
                        </TooltipProvider>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
