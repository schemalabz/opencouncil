"use client";

import { useTranslations } from 'next-intl';
import type { AttendanceStatus } from '@prisma/client';
import { renderIssue } from '@/lib/derivation/issueText';
import type { AttendanceOrigin, Issue, TallyDiff, VoteOrigin } from '@/lib/derivation/types';

type T = ReturnType<typeof useTranslations>;

export interface AuditVoteRow { name: string; origin: VoteOrigin }
export interface AuditAttendanceRow { name: string; status: AttendanceStatus; origin: AttendanceOrigin }

export interface AuditEvidenceProps {
    /** What the document itself says about the vote, verbatim. */
    voteResultPhrase: string | null;
    votes: AuditVoteRow[];
    attendance: AuditAttendanceRow[];
    /** The vote types whose printed count and derived rows disagree. */
    tallyDiffs: TallyDiff[];
    /** The sentences the documents state this subject's attendance changes in. */
    changeTexts: string[];
    /** This subject's issues, meeting-wide ones excluded. */
    issues: Issue[];
    /** Names a document printed that matched no person. */
    unmatchedNames: string[];
    /** The outcome is the document's phrase and nothing else. */
    phraseOnly: boolean;
}

const SECTION = 'space-y-1';
const HEADING = 'text-xs font-medium text-muted-foreground';

/**
 * One origin's names, counted.
 *
 * Two labelled groups rather than a marker on each name: twelve Greek surnames
 * with a superscript apiece is a puzzle, where "these eight were printed, these
 * four were not" is a sentence.
 */
function OriginGroup({ filled, label, count, children }: {
    filled: boolean;
    label: string;
    count: number;
    children?: React.ReactNode;
}) {
    return (
        <div className="text-xs">
            <span className="inline-flex items-baseline gap-1.5">
                <span
                    className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${filled ? 'bg-foreground' : 'border border-dashed border-muted-foreground'}`}
                    aria-hidden
                />
                <span className="text-foreground">{label}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
            </span>
            {children}
        </div>
    );
}

/** The names of one origin group, by attendance status, each status on its own line. */
function AttendanceNames({ t, rows }: { t: T; rows: AuditAttendanceRow[] }) {
    const byStatus: [AttendanceStatus, string][] = [['PRESENT', t('present')], ['ABSENT', t('absent')]];
    return (
        <div className="ml-3 text-xs text-muted-foreground">
            {byStatus.map(([status, label]) => {
                const names = rows.filter(r => r.status === status);
                if (names.length === 0) return null;
                return <div key={status}>{label}: {names.map(r => r.name).join(', ')}</div>;
            })}
        </div>
    );
}

/**
 * The evidence behind one subject's derived facts, for the audit-mode reader:
 * what the document printed, what the derivation concluded from it, and every
 * gap between the two.
 *
 * The ordinary extraction pane above this is untouched. This block only adds
 * the things that were stored and never shown — the origins, the phrase the
 * inference was licensed by, the printed tally, the sentences behind the
 * attendance changes, and the issue messages that were hidden in `title=`
 * tooltips a touch screen cannot reach.
 */
export function AuditEvidence(props: AuditEvidenceProps) {
    const t = useTranslations('admin.decisionsPage');
    const { voteResultPhrase, votes, attendance, tallyDiffs, changeTexts, issues, unmatchedNames, phraseOnly } = props;

    const statedVotes = votes.filter(v => v.origin === 'stated');
    const inferredVotes = votes.filter(v => v.origin === 'inferred');
    const statedAttendance = attendance.filter(a => a.origin === 'stated');
    const derivedAttendance = attendance.filter(a => a.origin === 'derived');
    // TALLY_MISMATCH's own sentence is the two numbers in prose; printed beside
    // the comparison below it, it says the same thing twice.
    const listedIssues = tallyDiffs.length > 0 ? issues.filter(i => i.code !== 'TALLY_MISMATCH') : issues;

    return (
        <div className="space-y-3 rounded-[7px] border border-[hsl(var(--orange))]/20 p-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[hsl(var(--orange))]/70">
                {t('audit.title')}
            </div>

            {phraseOnly && (
                <div className="text-xs text-foreground">{t('audit.phraseOnly')}</div>
            )}

            {/* The licence for every inference under it: the marker says a vote
                was inferred, the printed sentence is what lets a reader judge
                whether it should have been. */}
            {voteResultPhrase && (
                <div className="border-l-2 border-muted-foreground/30 bg-muted/50 py-1 pl-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('audit.asPrinted')}</div>
                    <div className="text-xs text-foreground">{voteResultPhrase}</div>
                </div>
            )}

            {votes.length > 0 && (
                <div className={SECTION}>
                    <div className={HEADING}>{t('votes')}</div>
                    {statedVotes.length > 0 && (
                        <OriginGroup filled label={t('audit.namedInDocument')} count={statedVotes.length}>
                            <div className="ml-3 text-xs text-muted-foreground">{statedVotes.map(v => v.name).join(', ')}</div>
                        </OriginGroup>
                    )}
                    {inferredVotes.length > 0 && (
                        <OriginGroup filled={false} label={t('audit.inferredFromPresence')} count={inferredVotes.length}>
                            <div className="ml-3 text-xs text-muted-foreground">{inferredVotes.map(v => v.name).join(', ')}</div>
                        </OriginGroup>
                    )}
                </div>
            )}

            {attendance.length > 0 && (
                <div className={SECTION}>
                    <div className={HEADING}>{t('attendance')}</div>
                    {statedAttendance.length > 0 && (
                        <OriginGroup filled label={t('audit.attendanceFromList')} count={statedAttendance.length}>
                            <AttendanceNames t={t} rows={statedAttendance} />
                        </OriginGroup>
                    )}
                    {derivedAttendance.length > 0 && (
                        <OriginGroup filled={false} label={t('audit.attendanceFromRollCall')} count={derivedAttendance.length}>
                            <AttendanceNames t={t} rows={derivedAttendance} />
                        </OriginGroup>
                    )}
                </div>
            )}

            {tallyDiffs.length > 0 && (
                <div className={SECTION}>
                    <div className={HEADING}>{t('audit.tallyHeading')}</div>
                    {tallyDiffs.map(diff => (
                        <div key={diff.type} className="flex items-baseline gap-2 text-xs">
                            <span className="text-foreground">{t('audit.tallyType', { type: diff.type })}</span>
                            <span className="text-muted-foreground">{t('audit.tallyPrinted')}</span>
                            <span className="tabular-nums text-foreground">{diff.printed}</span>
                            <span className="text-muted-foreground">{t('audit.tallyDerived')}</span>
                            {/* Amber on the number, never on a row: the row's
                                amber already means a proposal is waiting. */}
                            <span className="tabular-nums font-medium text-amber-700">{diff.derived}</span>
                        </div>
                    ))}
                </div>
            )}

            {changeTexts.length > 0 && (
                <div className={SECTION}>
                    <div className={HEADING}>{t('audit.changesHeading')}</div>
                    {/* TODO(audit): the event's reportingDocuments/totalDocuments
                        belong here — «δηλώθηκε σε 5 από 8 έγγραφα» — but they are
                        stored on AttendanceEvent and reach no client payload:
                        DerivationOutput carries neither the events nor those
                        counts, and MinutesAttendanceChange drops them. Adding
                        them means changing src/lib/derivation (owned elsewhere
                        while this was written). The sentence is what is
                        reachable today. */}
                    {changeTexts.map((text, i) => (
                        <div key={i} className="text-xs text-muted-foreground">{text}</div>
                    ))}
                </div>
            )}

            {(listedIssues.length > 0 || unmatchedNames.length > 0) && (
                <div className={SECTION}>
                    <div className={HEADING}>{t('issues.title')}</div>
                    {/* The message as text. The rail's card keeps it in a
                        `title=` tooltip, which a touch screen never shows and
                        nobody can copy out of. */}
                    {listedIssues.map((issue, i) => (
                        <div key={`${issue.code}-${issue.personId ?? ''}-${i}`} className="text-xs text-foreground">
                            {renderIssue(t, issue)}
                            {issue.rawText && <span className="block text-muted-foreground">{issue.rawText}</span>}
                        </div>
                    ))}
                    {unmatchedNames.length > 0 && (
                        <div className="text-xs text-foreground">
                            <span className="text-muted-foreground">{t('audit.unmatchedNames')}</span>{' '}
                            {unmatchedNames.join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
