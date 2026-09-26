"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RailCard } from '@/components/ui/rail-card';
import type { RollCall } from '@/components/meetings/decisions/timeline';
import { RollCallHeadLines, useRollCallName } from '@/components/meetings/decisions/RollCallLines';

/** The rail's roll-call card: the minutes' roll call lines, the present/absent
 * count with the absent names inline, and the present names behind an
 * expander. A council counts against its ΣΥΝΘΕΣΗ; a committee counts its
 * members and names the substitutes who sat in. Renders nothing when the
 * minutes hold no roll call. */
export function PresenceCard({ rollCall }: { rollCall: RollCall | null }) {
    const tPage = useTranslations('admin.decisionsPage');
    const nameOf = useRollCallName();
    const [expanded, setExpanded] = useState(false);

    if (!rollCall) return null;

    const { present, absent, isCommittee } = rollCall;
    const substitutes = present.filter(m => m.isSubstitute);

    return (
        <RailCard title={tPage('attendance')}>
            <div className="space-y-1.5 text-xs">
                <RollCallHeadLines rollCall={rollCall} perSubject={false} />
                <div className="font-medium">
                    {isCommittee
                        ? tPage('presenceMembersHeadline', { present: present.length })
                        : tPage('presenceHeadline', { present: present.length, total: rollCall.compositionSize })}
                </div>
                {substitutes.length > 0 && (
                    <div className="text-muted-foreground">
                        <span>{tPage('presenceSubstitutesInline', { n: substitutes.length })}</span> {substitutes.map(m => m.member.name).join(', ')}
                    </div>
                )}
                {/* A full house has an attendance record with no ABSENT rows, so the
                    line would read "0 absent:" with nothing after it. */}
                {absent.length > 0 && (
                    <div className="text-muted-foreground">
                        <span>{tPage(isCommittee ? 'presenceMembersAbsentInline' : 'presenceAbsentInline', { n: absent.length })}</span> {absent.map(nameOf).join(', ')}
                    </div>
                )}
                <button type="button" aria-expanded={expanded} className="underline hover:text-foreground" onClick={() => setExpanded(prev => !prev)}>
                    {expanded ? tPage('showLess') : tPage('showMore')}
                </button>
                {expanded && (
                    <div className="text-muted-foreground">
                        <span>{tPage(isCommittee ? 'presenceMembersPresentList' : 'presencePresentList', { n: present.length })}</span> {present.map(nameOf).join(', ')}
                    </div>
                )}
            </div>
        </RailCard>
    );
}
