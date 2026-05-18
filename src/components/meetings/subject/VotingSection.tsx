"use client";
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { UtteranceMiniTranscript } from './UtteranceMiniTranscript';
import { calculateVoteResult, getAbsentNonVoterIds } from '@/lib/utils/votes';
import { compareRanks } from '@/lib/sorting/people';
import { formatSurnameFirst } from '@/lib/formatters/name';
import { isMayorRole, isRoleActiveAt } from '@/lib/utils/roles';
import { VoteType } from '@prisma/client';
import { Loader2 } from 'lucide-react';

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

interface Vote {
    voteType: VoteType;
    person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] };
}

interface AttendanceRecord {
    status: 'PRESENT' | 'ABSENT';
    person: { id: string; name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] };
}

interface VotingSectionProps {
    subjectId: string;
    votes: Vote[];
    attendance?: AttendanceRecord[];
}

function sortByElectedOrder<T extends { person: { name: string; roles: { electedOrder: number | null; administrativeBodyId: string | null }[] } }>(
    items: T[], administrativeBodyId: string | null,
): T[] {
    return [...items].sort((a, b) => {
        const aRole = a.person.roles.find(r => r.administrativeBodyId === administrativeBodyId);
        const bRole = b.person.roles.find(r => r.administrativeBodyId === administrativeBodyId);
        const orderCompare = compareRanks(aRole?.electedOrder ?? null, bRole?.electedOrder ?? null);
        if (orderCompare !== 0) return orderCompare;
        return a.person.name.localeCompare(b.person.name);
    });
}

function VoteBreakdown({ votes, attendance }: { votes: Vote[]; attendance: AttendanceRecord[] }) {
    const t = useTranslations('Subject');
    const { meeting, people } = useCouncilMeetingData();
    const administrativeBodyId = meeting.administrativeBodyId ?? null;
    const result = useMemo(() => calculateVoteResult(votes), [votes]);

    const mayorPersonId = useMemo(() => {
        const meetingDate = new Date(meeting.dateTime);
        return people.find(p =>
            p.roles.some(r => isRoleActiveAt(r, meetingDate) && isMayorRole(r))
        )?.id ?? null;
    }, [people, meeting.dateTime]);

    const forVoters = useMemo(() => sortByElectedOrder(votes.filter(v => v.voteType === 'FOR'), administrativeBodyId), [votes, administrativeBodyId]);
    const againstVoters = useMemo(() => sortByElectedOrder(votes.filter(v => v.voteType === 'AGAINST'), administrativeBodyId), [votes, administrativeBodyId]);
    const abstainVoters = useMemo(() => sortByElectedOrder(votes.filter(v => v.voteType === 'ABSTAIN'), administrativeBodyId), [votes, administrativeBodyId]);
    const presentVoters = useMemo(() => sortByElectedOrder(votes.filter(v => v.voteType === 'PRESENT'), administrativeBodyId), [votes, administrativeBodyId]);
    const didNotVoteVoters = useMemo(() => sortByElectedOrder(votes.filter(v => v.voteType === 'DID_NOT_VOTE'), administrativeBodyId), [votes, administrativeBodyId]);

    // Absent members: those in attendance with ABSENT status who didn't vote (excluding mayor)
    const absentMembers = useMemo(() => {
        if (!attendance || attendance.length === 0) return [];
        const voterIds = new Set(votes.map(v => v.person.id));
        const absentIds = getAbsentNonVoterIds(
            attendance.map(a => ({ personId: a.person.id, status: a.status })),
            voterIds,
            mayorPersonId,
        );
        return sortByElectedOrder(
            attendance.filter(a => absentIds.has(a.person.id)),
            administrativeBodyId,
        );
    }, [attendance, votes, administrativeBodyId, mayorPersonId]);

    return (
        <div className="p-4 space-y-3">
            <table className="w-full text-sm">
                <tbody>
                    <tr>
                        <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                            {t('decides')}
                        </td>
                        <td className="py-1.5">
                            {result.isUnanimous
                                ? t('unanimousVerdict')
                                : result.passed
                                    ? t('majorityVerdict')
                                    : t('rejectedVerdict')}
                        </td>
                    </tr>
                    {forVoters.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('voteFor')} ({forVoters.length})
                            </td>
                            <td className="py-1.5">
                                {forVoters.map(v => formatSurnameFirst(v.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                    {againstVoters.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('voteAgainst')} ({againstVoters.length})
                            </td>
                            <td className="py-1.5">
                                {againstVoters.map(v => formatSurnameFirst(v.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                    {abstainVoters.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('voteAbstain')} ({abstainVoters.length})
                            </td>
                            <td className="py-1.5">
                                {abstainVoters.map(v => formatSurnameFirst(v.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                    {presentVoters.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('votePresent')} ({presentVoters.length})
                            </td>
                            <td className="py-1.5">
                                {presentVoters.map(v => formatSurnameFirst(v.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                    {didNotVoteVoters.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('voteDidNotVote')} ({didNotVoteVoters.length})
                            </td>
                            <td className="py-1.5">
                                {didNotVoteVoters.map(v => formatSurnameFirst(v.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                    {absentMembers.length > 0 && (
                        <tr>
                            <td className="py-1.5 pr-4 text-muted-foreground font-medium whitespace-nowrap align-top">
                                {t('voteAbsent')} ({absentMembers.length})
                            </td>
                            <td className="py-1.5">
                                {absentMembers.map(a => formatSurnameFirst(a.person.name)).join(', ')}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function VotingUtterancesDisplay({ utterancesBySegment, getSpeakerSegmentById, cityId }: {
    utterancesBySegment: Map<string, VotingUtterance[]>;
    getSpeakerSegmentById: (id: string) => ReturnType<ReturnType<typeof useCouncilMeetingData>['getSpeakerSegmentById']>;
    cityId: string;
}) {
    return (
        <div className="space-y-3">
            {Array.from(utterancesBySegment.entries()).map(([segmentId, segmentVotingUtterances]) => {
                const transcriptSegment = getSpeakerSegmentById(segmentId);
                if (!transcriptSegment) return null;

                return (
                    <UtteranceMiniTranscript
                        key={segmentId}
                        targetUtteranceIds={segmentVotingUtterances.map(u => u.id)}
                        allUtterances={transcriptSegment.utterances}
                        speakerSegment={segmentVotingUtterances[0].speakerSegment}
                        cityId={cityId}
                    />
                );
            })}
        </div>
    );
}

export function VotingSection({ subjectId, votes, attendance }: VotingSectionProps) {
    const [votingUtterances, setVotingUtterances] = useState<VotingUtterance[] | null>(null);
    const [loading, setLoading] = useState(true);
    const { meeting, getSpeakerSegmentById } = useCouncilMeetingData();
    const t = useTranslations('Subject');

    const hasExtractedVotes = votes && votes.length > 0;

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

    // Group voting utterances by speaker segment (shared across both branches)
    const utterancesBySegment = useMemo(() => {
        const grouped = new Map<string, VotingUtterance[]>();
        if (!votingUtterances) return grouped;
        for (const utterance of votingUtterances) {
            const segmentId = utterance.speakerSegment.id;
            if (!grouped.has(segmentId)) {
                grouped.set(segmentId, []);
            }
            grouped.get(segmentId)!.push(utterance);
        }
        return grouped;
    }, [votingUtterances]);

    const hasUtterances = utterancesBySegment.size > 0;

    // Extracted votes: show structured breakdown, with utterances below if available
    if (hasExtractedVotes) {
        return (
            <div>
                <VoteBreakdown votes={votes} attendance={attendance ?? []} />
                {hasUtterances && (
                    <div className="border-t border-border p-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                            {t('votingSource')}
                        </p>
                        <VotingUtterancesDisplay
                            utterancesBySegment={utterancesBySegment}
                            getSpeakerSegmentById={getSpeakerSegmentById}
                            cityId={meeting.cityId}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Fallback: no extracted votes — show utterances only
    if (loading) {
        return (
            <div className="p-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!hasUtterances) {
        return (
            <div className="p-4 text-sm text-muted-foreground">
                {t('noVotingUtterances')}
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground mb-3">
                {t('votingDisclaimer')}
            </p>
            <VotingUtterancesDisplay
                utterancesBySegment={utterancesBySegment}
                getSpeakerSegmentById={getSpeakerSegmentById}
                cityId={meeting.cityId}
            />
        </div>
    );
}
