import React, { useMemo, useState } from 'react';
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { useVideo } from '../VideoProvider';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import TopicBadge from './Topic';
import { PersonBadge } from '@/components/persons/PersonBadge';
import UtteranceC from "./Utterance";
import { useTranscriptOptions } from "../options/OptionsContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, FileJson, MessageSquarePlus } from "lucide-react";
import { getPartyFromRoles, buildUnknownSpeakerLabel, UNKNOWN_SPEAKER_LABEL, formatTimestamp } from "@/lib/utils";
import { AIGeneratedBadge } from '@/components/AIGeneratedBadge';
import SpeakerSegmentMetadataDialog from "./SpeakerSegmentMetadataDialog";
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

const AddSegmentButton = ({ segmentId }: { segmentId: string }) => {
    const { createEmptySegmentAfter } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();

    if (!options.editable) return null;

    return (
        <div className="w-full h-2 group relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 bg-white hover:bg-gray-100"
                            onClick={() => createEmptySegmentAfter(segmentId)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add new segment
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Add a new empty segment here</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};

const AddSegmentBeforeButton = ({ segmentId, isFirstSegment }: { 
    segmentId: string, 
    isFirstSegment: boolean 
}) => {
    const { createEmptySegmentBefore } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();

    // Only show for the first segment
    if (!options.editable || !isFirstSegment) return null;

    return (
        <div className="w-full h-2 group relative">
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 bg-white hover:bg-gray-100"
                            onClick={() => createEmptySegmentBefore(segmentId)}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Add segment before
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Add a new empty segment before the first segment</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};

const EmptySegmentState = ({ segmentId }: { segmentId: string }) => {
    const { addUtteranceToSegment } = useCouncilMeetingData();
    const [isLoading, setIsLoading] = useState(false);
    const t = useTranslations('transcript.emptySegment');

    const handleAddUtterance = async () => {
        setIsLoading(true);
        try {
            const newUtteranceId = await addUtteranceToSegment(segmentId);
            
            // Focus on the new utterance after a short delay to ensure it's rendered
            setTimeout(() => {
                const utteranceElement = document.getElementById(newUtteranceId);
                if (utteranceElement) {
                    utteranceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    utteranceElement.click(); // Trigger click to enter edit mode
                }
            }, 100);
        } catch (error) {
            console.error('Failed to add utterance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="px-4 py-8 flex flex-col items-center gap-3 border-2 border-dashed border-muted rounded-md my-2">
            <MessageSquarePlus className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noUtterances')}</p>
            <Button 
                onClick={handleAddUtterance} 
                size="sm" 
                variant="outline"
                disabled={isLoading}
            >
                <Plus className="h-4 w-4 mr-2" />
                {isLoading ? t('adding') : t('addUtterance')}
            </Button>
        </div>
    );
};

const AddUtteranceButton = ({ segmentId }: { segmentId: string }) => {
    const { addUtteranceToSegment } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const t = useTranslations('transcript.addUtterance');

    if (!options.editable) return null;

    const handleAddUtterance = async () => {
        try {
            const newUtteranceId = await addUtteranceToSegment(segmentId);
            
            // Focus on the new utterance after a short delay to ensure it's rendered
            setTimeout(() => {
                const utteranceElement = document.getElementById(newUtteranceId);
                if (utteranceElement) {
                    utteranceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    utteranceElement.click(); // Trigger click to enter edit mode
                }
            }, 100);
        } catch (error) {
            console.error('Failed to add utterance:', error);
        }
    };

    return (
        <span className="inline-flex items-center group relative ml-1">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 text-muted-foreground hover:text-primary"
                        onClick={handleAddUtterance}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{t('tooltip')}</p>
                </TooltipContent>
            </Tooltip>
        </span>
    );
};

const SpeakerSegment = React.memo(({ segment, renderMock, isFirstSegment }: { 
    segment: TranscriptType[number], 
    renderMock: boolean,
    isFirstSegment?: boolean 
}) => {
    const { getPerson, getSpeakerTag, getSpeakerSegmentCount, people, speakerTags, updateSpeakerTagPerson, updateSpeakerTagLabel, deleteEmptySegment } = useCouncilMeetingData();
    const { currentTime } = useVideo();
    const { options } = useTranscriptOptions();
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin;
    const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);

    // Calculate the next unknown speaker label
    const nextUnknownLabel = useMemo(() => {
        if (!speakerTags) return buildUnknownSpeakerLabel(1);

        let maxIndex = 0;
        speakerTags.forEach(tag => {
            if (tag.label?.startsWith(UNKNOWN_SPEAKER_LABEL)) {
                // Extract number from end of string
                const match = tag.label.match(/(\d+)$/);
                if (match) {
                    const index = parseInt(match[1], 10);
                    if (!isNaN(index)) {
                        maxIndex = Math.max(maxIndex, index);
                    }
                }
            }
        });

        return buildUnknownSpeakerLabel(maxIndex + 1);
    }, [speakerTags]);

    const memoizedData = useMemo(() => {
        const speakerTag = getSpeakerTag(segment.speakerTagId);
        const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;

        const party = person ? getPartyFromRoles(person.roles) : null;
        const borderColor = party?.colorHex || '#D3D3D3';

        const segmentCount = speakerTag ? getSpeakerSegmentCount(speakerTag.id) : 0;
        return { speakerTag, person, party, borderColor, segmentCount };
    }, [segment.speakerTagId, getPerson, getSpeakerTag, getSpeakerSegmentCount]);

    const utterances = segment.utterances;
    if (!utterances) {
        return null;
    }

    const isEmpty = utterances.length === 0;

    const summary = segment.summary;

    const handlePersonChange = (personId: string | null) => {
        if (memoizedData.speakerTag) {
            updateSpeakerTagPerson(memoizedData.speakerTag.id, personId);
        }
    };

    const handleLabelChange = (label: string) => {
        if (memoizedData.speakerTag) {
            updateSpeakerTagLabel(memoizedData.speakerTag.id, label);
        }
    };

    return (
        <>
            {/* Add the new button before the segment */}
            {options.editable && isFirstSegment && !renderMock && (
                <AddSegmentBeforeButton segmentId={segment.id} isFirstSegment={true} />
            )}
            
            <div className='my-6 flex flex-col items-start w-full rounded-r-lg hover:bg-accent/5 transition-colors' style={{ borderLeft: `4px solid ${memoizedData.borderColor}` }}>
                <div className='w-full'>
                    <div 
                        className='sticky flex flex-row items-center justify-between w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-30 transition-all duration-200'
                        style={{ top: 'var(--banner-offset, 0px)' }}
                    >
                        {renderMock ? (
                            <div className='flex flex-col w-full space-y-2 py-2'>
                                <div className='flex items-center justify-between w-full px-4'>
                                    <div className='flex-grow overflow-hidden'>
                                        <div className='h-6 bg-muted rounded animate-pulse' />
                                    </div>
                                    <div className='flex items-center gap-3 ml-4'>
                                        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                            <span className='font-medium'>{formatTimestamp(segment.startTimestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                                {summary && (
                                    <div className='px-4 space-y-2'>
                                        <div className='text-sm'>
                                            <div className='h-4 bg-muted rounded animate-pulse' />
                                        </div>
                                        <div className='flex items-center justify-between'>
                                            {segment.topicLabels.length > 0 && (
                                                <div className='flex flex-wrap gap-2'>
                                                    {segment.topicLabels.map(tl =>
                                                        <div key={tl.topic.id} className='h-6 w-16 bg-muted rounded animate-pulse' />
                                                    )}
                                                </div>
                                            )}
                                            <div className='flex items-center gap-2 text-xs text-muted-foreground ml-auto'>
                                                {summary?.type === 'procedural' && (
                                                    <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                        Διαδικαστικό
                                                    </span>
                                                )}
                                                <AIGeneratedBadge />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className='flex flex-col w-full space-y-2 py-2'>
                                <div className='flex items-center justify-between w-full px-4'>
                                    <div className='flex-grow overflow-hidden'>
                                        {memoizedData.speakerTag && (
                                            <PersonBadge
                                                person={memoizedData.person}
                                                speakerTag={memoizedData.speakerTag}
                                                segmentCount={memoizedData.segmentCount}
                                                editable={options.editable}
                                                onPersonChange={handlePersonChange}
                                                onLabelChange={handleLabelChange}
                                                nextUnknownLabel={nextUnknownLabel}
                                                availablePeople={people.map(p => ({
                                                    ...p,
                                                    party: getPartyFromRoles(p.roles)
                                                }))}
                                            />
                                        )}
                                    </div>
                                    <div className='flex items-center gap-3 ml-4'>
                                        {options.editable && isEmpty && !renderMock && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => deleteEmptySegment(segment.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Delete empty segment</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                        {isSuperAdmin && !renderMock && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        onClick={() => setMetadataDialogOpen(true)}
                                                    >
                                                        <FileJson className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>View segment metadata</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        )}
                                        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                            <span className='font-medium'>{formatTimestamp(segment.startTimestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                                {summary && (
                                    <div className='px-4 space-y-2'>
                                        <div className='text-sm'>
                                            {summary.text}
                                        </div>
                                        <div className='flex items-center justify-between'>
                                            {segment.topicLabels.length > 0 && (
                                                <div className='flex flex-wrap gap-2'>
                                                    {segment.topicLabels.map(tl =>
                                                        <TopicBadge topic={tl.topic} key={tl.topic.id} />
                                                    )}
                                                </div>
                                            )}
                                            <div className='flex items-center gap-2 text-xs text-muted-foreground ml-auto'>
                                                {summary?.type === 'procedural' && (
                                                    <span className="bg-muted/50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                        Διαδικαστικό
                                                    </span>
                                                )}
                                                <AIGeneratedBadge />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className='font-mono px-4 py-3 text-justify w-full leading-relaxed group'>
                        {utterances.length === 0 && options.editable && !renderMock ? (
                            <EmptySegmentState segmentId={segment.id} />
                        ) : renderMock ? (
                            <div className='w-full break-words whitespace-pre-wrap'>
                                {utterances.map((u, i) =>
                                    <span className='break-words' id={u.id} key={u.id}>{u.text} </span>
                                )}
                            </div>
                        ) : (
                            <div className='w-full break-words whitespace-pre-wrap'>
                                {utterances.map((u) => <UtteranceC utterance={u} key={u.id} />)}
                                {utterances.length > 0 && options.editable && (
                                    <AddUtteranceButton segmentId={segment.id} />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {options.editable && (
                renderMock ? (
                    <div className="w-full h-2" />
                ) : (
                    <AddSegmentButton segmentId={segment.id} />
                )
            )}

            <SpeakerSegmentMetadataDialog
                segment={segment}
                open={metadataDialogOpen}
                onOpenChange={setMetadataDialogOpen}
            />
        </>
    );
});

SpeakerSegment.displayName = 'SpeakerSegment';

export default SpeakerSegment;
