"use client";

import { useTranslations } from 'next-intl';
import type { AuthorityType } from '@prisma/client';
import type { MinutesRollCall, MinutesRollCallMember } from '@/lib/minutes/types';
import { authorityKey } from '@/lib/utils/authority';

/**
 * The ΔΗΜΑΡΧΟΣ and ΠΡΟΕΔΡΟΣ lines of a roll call, as the minutes print them: a
 * council names the mayor on a line of their own; a committee names the mayor
 * only as «(Δήμαρχος)» after the president, when the mayor presides. When the
 * president was absent and someone else presided, the president's line names
 * that person, and the parenthesis names the absent president.
 *
 * `perSubject`: the lines of one subject's attendance. The minutes print no
 * mayor line per subject, and the mayor's note describes the whole meeting, so
 * both stay out. The president's line shows the absent mark only.
 *
 * `authorityType`: the head of a region is the Περιφερειάρχης, so each line that
 * names the head has a text for each kind of authority (#993).
 */
export function RollCallHeadLines({ rollCall, perSubject, authorityType }: { rollCall: MinutesRollCall; perSubject: boolean; authorityType: AuthorityType }) {
    const tPage = useTranslations('admin.decisionsPage');
    const status = (note: string | null, absent: boolean, feminine: boolean) =>
        !perSubject && note ? ` (${note})` : absent ? ` — ${tPage('presenceAbsentMark', { gender: feminine ? 'female' : 'other' })}` : '';
    return (
        <>
            {rollCall.mayor && !perSubject && (
                <div><span className="text-muted-foreground">{tPage(authorityKey('presenceMayor', { authorityType }))}</span> {rollCall.mayor.name}{status(rollCall.mayor.note, rollCall.mayor.absent, rollCall.mayor.feminine)}</div>
            )}
            {rollCall.president && (
                <div>
                    <span className="text-muted-foreground">{tPage('presencePresident')}</span>{' '}
                    {rollCall.president.presidedBy
                        ? `${rollCall.president.presidedBy.name} (${tPage(authorityKey('presenceChairInAbsence', { authorityType }), {
                            gender: rollCall.president.feminine ? 'female' : 'other',
                            mayor: rollCall.president.isMayor ? 'yes' : 'no',
                            name: rollCall.president.name,
                        })})`
                        : <>{rollCall.president.name}{rollCall.president.isMayor ? ` ${tPage(authorityKey('presenceMayorSuffix', { authorityType }))}` : ''}{status(rollCall.president.note, rollCall.president.absent, rollCall.president.feminine)}</>}
                </div>
            )}
        </>
    );
}

/**
 * A member's name as a roll-call list shows it: a substitute carries the
 * minutes' mark, and an absent president carries the office.
 */
export function useRollCallName(authorityType: AuthorityType): (entry: MinutesRollCallMember) => string {
    const tPage = useTranslations('admin.decisionsPage');
    return ({ member, isSubstitute, office }) => {
        const marks = [
            ...(isSubstitute ? [tPage('presenceSubstituteMark')] : []),
            ...(office ? [tPage(authorityKey('presenceChairMark', { authorityType }), { gender: office.feminine ? 'female' : 'other', mayor: office.isMayor ? 'yes' : 'no' })] : []),
        ];
        return marks.length > 0 ? `${member.name} (${marks.join(', ')})` : member.name;
    };
}
