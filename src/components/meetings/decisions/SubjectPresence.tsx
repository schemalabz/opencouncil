"use client";

import { useTranslations } from 'next-intl';
import { NameList } from '@/components/meetings/decisions/shared';
import { RollCallHeadLines, useRollCallName } from '@/components/meetings/decisions/RollCallLines';
import type { MinutesRollCall } from '@/lib/minutes/types';

/**
 * One subject's attendance on the decisions page: the lines of the roll call
 * card, from `buildRollCall` with this subject's absentees, so a subject and
 * the roll call count the same people. The minutes print no mayor line per
 * subject, so this block prints none either.
 */
export function SubjectPresence({ rollCall }: { rollCall: MinutesRollCall }) {
    const tPage = useTranslations('admin.decisionsPage');
    const nameOf = useRollCallName();
    const { present, absent } = rollCall;
    return (
        <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">{tPage('attendance')}</div>
            <div className="text-xs text-foreground space-y-1">
                <RollCallHeadLines rollCall={rollCall} perSubject />
                <span>{present.length} {tPage('present')}, {absent.length} {tPage('absent')}</span>
                <div className="flex flex-col gap-1">
                    {present.length > 0 && (
                        <NameList names={present.map(nameOf)} label={`${tPage('showNames')} (${tPage('present')})`} />
                    )}
                    {absent.length > 0 && (
                        <NameList names={absent.map(nameOf)} label={`${tPage('showNames')} (${tPage('absent')})`} />
                    )}
                </div>
            </div>
        </div>
    );
}
