"use client";
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { UtteranceMiniTranscript } from './UtteranceMiniTranscript';

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
    const { meeting, getSpeakerSegmentById } = useCouncilMeetingData();
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

    // Group voting utterances by speaker segment for smart display
    const utterancesBySegment = new Map<string, VotingUtterance[]>();
    for (const votingUtterance of votingUtterances) {
        const segmentId = votingUtterance.speakerSegment.id;
        if (!utterancesBySegment.has(segmentId)) {
            utterancesBySegment.set(segmentId, []);
        }
        utterancesBySegment.get(segmentId)!.push(votingUtterance);
    }

    return (
        <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground mb-3">
                {t('votingDisclaimer')}
            </p>
            <div className="space-y-3">
                {Array.from(utterancesBySegment.entries()).map(([segmentId, segmentVotingUtterances]) => {
                    const transcriptSegment = getSpeakerSegmentById(segmentId);
                    if (!transcriptSegment) return null;

                    const targetUtteranceIds = segmentVotingUtterances.map(u => u.id);
                    const allUtterances = transcriptSegment.utterances;

                    return (
                        <UtteranceMiniTranscript
                            key={segmentId}
                            targetUtteranceIds={targetUtteranceIds}
                            allUtterances={allUtterances}
                            speakerSegment={segmentVotingUtterances[0].speakerSegment}
                            cityId={meeting.cityId}
                        />
                    );
                })}
            </div>
        </div>
    );
}
