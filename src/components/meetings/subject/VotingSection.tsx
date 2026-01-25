"use client";
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { UtteranceMiniTranscript } from './UtteranceMiniTranscript';
import type { Utterance } from '@prisma/client';

interface VotingUtterance {
    id: string;
    text: string;
    startTimestamp: number;
    endTimestamp: number;
    speakerSegment: {
        id: string;
        speakerTagId: string;
        speakerTag: {
            id: string;
            label: string | null;
            personId: string | null;
            person: {
                id: string;
                name: string;
                image: string | null;
                roles: Array<{
                    party: {
                        id: string;
                        colorHex: string;
                    };
                }>;
            } | null;
        };
    };
}

interface VotingSectionProps {
    subjectId: string;
}

export function VotingSection({ subjectId }: VotingSectionProps) {
    const [votingUtterances, setVotingUtterances] = useState<VotingUtterance[] | null>(null);
    const [loading, setLoading] = useState(true);
    const { transcript, meeting } = useCouncilMeetingData();
    const t = useTranslations('Subject');

    useEffect(() => {
        async function fetchVotingUtterances() {
            try {
                const response = await fetch('/api/subject/voting-utterances', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subjectId })
                });

                if (!response.ok) throw new Error('Failed to fetch');

                const data = await response.json();
                setVotingUtterances(data.utterances);
            } catch (error) {
                console.error('Error fetching voting utterances:', error);
                setVotingUtterances([]);
            } finally {
                setLoading(false);
            }
        }

        fetchVotingUtterances();
    }, [subjectId]);

    if (loading) {
        return <div className="p-4 text-sm text-muted-foreground">Φόρτωση...</div>;
    }

    if (!votingUtterances || votingUtterances.length === 0) {
        return (
            <div className="p-4 text-sm text-muted-foreground">
                {t('noVotingUtterances')}
            </div>
        );
    }

    // Build context for each voting utterance
    const utterancesWithContext = votingUtterances.map(votingUtterance => {
        // Find the utterance's speaker segment in transcript
        const segmentUtterances = transcript
            .find(seg => seg.id === votingUtterance.speakerSegment.id)
            ?.utterances || [];

        const targetIndex = segmentUtterances.findIndex(u => u.id === votingUtterance.id);

        if (targetIndex === -1) {
            // Fallback: single utterance with no context
            return {
                contextUtterances: [votingUtterance as unknown as Utterance],
                targetIndex: 0,
                hasMore: { before: false, after: false },
                speakerSegment: votingUtterance.speakerSegment
            };
        }

        // Get 5 before + target + 5 after
        const start = Math.max(0, targetIndex - 5);
        const end = Math.min(segmentUtterances.length, targetIndex + 6);
        const contextUtterances = segmentUtterances.slice(start, end);
        const adjustedTargetIndex = targetIndex - start;

        return {
            contextUtterances,
            targetIndex: adjustedTargetIndex,
            hasMore: {
                before: start > 0,
                after: end < segmentUtterances.length
            },
            speakerSegment: votingUtterance.speakerSegment
        };
    });

    return (
        <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground mb-3">
                {t('votingDisclaimer')}
            </p>
            <div className="space-y-3">
                {utterancesWithContext.map((item, index) => (
                    <UtteranceMiniTranscript
                        key={votingUtterances[index].id}
                        utteranceId={votingUtterances[index].id}
                        contextUtterances={item.contextUtterances}
                        targetIndex={item.targetIndex}
                        hasMore={item.hasMore}
                        speakerSegment={item.speakerSegment}
                        cityId={meeting.cityId}
                    />
                ))}
            </div>
        </div>
    );
}
