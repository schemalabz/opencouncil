"use client";

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ExplainDerivationLink, SeverityChip, SeverityDot } from '@/components/meetings/decisions/auditGlossary';
import { RailCard } from '@/components/ui/rail-card';
import { IssueEvidence, type EvidenceLinks } from '@/components/meetings/decisions/IssueEvidence';
import { ISSUE_SEVERITY, groupByCode } from '@/lib/derivation/issueCatalogue';
import { issuePerson, renderIssue, renderIssuePerson, renderIssueStages } from '@/lib/derivation/issueText';
import type { Issue } from '@/lib/derivation/types';

type T = ReturnType<typeof useTranslations>;

/** A titled part of the card, named by its title for a screen reader. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} className="space-y-1.5">
            <h3 id={titleId} className="text-[10px] font-extrabold uppercase tracking-[.04em] text-muted-foreground">{title}</h3>
            {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
            {children}
        </section>
    );
}

/**
 * One meeting-wide issue, in full: nothing else on the page states it.
 *
 * @translationNamespace admin.decisionsPage
 */
function MeetingIssue({ t, issue, personName, evidenceLinks }: { t: T; issue: Issue; personName: (personId: string) => string | undefined; evidenceLinks?: EvidenceLinks }) {
    const severity = ISSUE_SEVERITY[issue.code];
    const person = issuePerson(issue, personName);
    const message = renderIssue(t, issue);
    return (
        <li>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SeverityDot severity={severity} />
                <span className="font-medium text-foreground">{t(`issues.codes.${issue.code}`)}</span>
                <SeverityChip severity={severity} />
            </div>
            <div className="mt-1 space-y-0.5 border-l-2 border-foreground/10 pl-2 text-muted-foreground">
                {person && <span className="block font-medium text-foreground/80">{renderIssuePerson(t, person)}</span>}
                <span className="block leading-relaxed">{message}</span>
                {/* The document's own words, unless the message already quotes them. */}
                {issue.rawText && !message.includes(issue.rawText) && (
                    <span className="block text-muted-foreground/70">{`«${issue.rawText}»`}</span>
                )}
                <IssueEvidence issue={issue} links={evidenceLinks} />
                <span className="block text-[11px] text-muted-foreground/80">{renderIssueStages(t, issue.code)}</span>
            </div>
        </li>
    );
}

/**
 * The rail's issues card: what the derivation could not settle, in two parts.
 *
 * - **The meeting's own issues** (no `subjectId`): the rules unconfirmed, a
 *   refused write, two names for one presiding member. No table row can carry
 *   them, so the card states each one in full.
 * - **The subjects' issues**: one line per code, counting the subjects that
 *   carry it. Their text is the table's to state — a subject's issues open in a
 *   row under it — so the card only takes the reader there. The line sends the
 *   page to the first of those subjects in the table's order, and a second press
 *   to the next, so the count is also a way through them.
 *
 * The page owns the derivation and the open row; this only shows them.
 */
export function IssuesCard({
    issues, subjectName, personName = () => undefined, subjectOrder = [], openSubjectId = null, onSelectSubject, onExplainDerivation, evidenceLinks,
}: {
    issues: Issue[];
    /** Names the subject a line goes to. */
    subjectName?: (subjectId: string) => string | undefined;
    /** Names the person an issue is about, from the people the page already holds. */
    personName?: (personId: string) => string | undefined;
    /** The table's order of subjects, which a line walks. A subject missing from it goes last. */
    subjectOrder?: string[];
    /** The subject whose issues are open in the table, so a line knows which one comes next. */
    openSubjectId?: string | null;
    /** Opens a subject's issues in the table. Without it the lines are plain text. */
    onSelectSubject?: (subjectId: string) => void;
    /** Opens the page's account of the whole derivation. The link is offered only when there is one. */
    onExplainDerivation?: () => void;
    /** Where a statement cited by an issue can be checked: the recording, the sheet. */
    evidenceLinks?: EvidenceLinks;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const meetingIssues = issues.filter(issue => !issue.subjectId);
    const position = (subjectId: string) => {
        const i = subjectOrder.indexOf(subjectId);
        return i < 0 ? subjectOrder.length : i;
    };
    const subjectGroups = groupByCode(issues.filter(issue => issue.subjectId), issue => issue.code).map(group => ({
        code: group.code,
        subjects: [...new Set(group.items.flatMap(issue => (issue.subjectId ? [issue.subjectId] : [])))]
            .sort((a, b) => position(a) - position(b)),
    }));

    return (
        <RailCard title={tPage('issues.title')}>
            <div className="space-y-3 text-xs">
                {issues.length === 0 && <div className="text-muted-foreground">{tPage('issues.none')}</div>}
                {issues.length > 0 && (
                    <>
                        <Section title={tPage('issues.meetingTitle')} hint={meetingIssues.length > 0 ? tPage('issues.meetingHint') : undefined}>
                            {meetingIssues.length === 0
                                ? <div className="text-muted-foreground">{tPage('issues.meetingNone')}</div>
                                : (
                                    <ul className="space-y-2.5">
                                        {meetingIssues.map((issue, i) => <MeetingIssue key={`${issue.code}-${i}`} t={tPage} issue={issue} personName={personName} evidenceLinks={evidenceLinks} />)}
                                    </ul>
                                )}
                        </Section>
                        <Section title={tPage('issues.subjectsTitle')}>
                            {subjectGroups.length === 0 && <div className="text-muted-foreground">{tPage('issues.subjectsNone')}</div>}
                            {subjectGroups.map(({ code, subjects }) => {
                                // The subject after the open one, or the first.
                                const current = openSubjectId ? subjects.indexOf(openSubjectId) : -1;
                                const target = subjects[(current + 1) % subjects.length];
                                const content = (
                                    <>
                                        <span className="inline-flex min-w-0 items-baseline gap-1.5">
                                            <SeverityDot severity={ISSUE_SEVERITY[code]} />
                                            <span className={onSelectSubject ? 'underline decoration-dotted decoration-muted-foreground/70 underline-offset-2' : undefined}>
                                                {tPage(`issues.codes.${code}`)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 tabular-nums text-muted-foreground">
                                            {tPage('issues.codeInSubjects', { subjects: subjects.length })}
                                        </span>
                                    </>
                                );
                                return onSelectSubject ? (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => onSelectSubject(target)}
                                        className="flex w-full items-baseline justify-between gap-2 text-left hover:text-foreground"
                                    >
                                        {content}
                                        <span className="sr-only">{tPage('issues.goToSubject', { subject: subjectName?.(target) ?? '' })}</span>
                                    </button>
                                ) : (
                                    <div key={code} className="flex w-full items-baseline justify-between gap-2">{content}</div>
                                );
                            })}
                        </Section>
                    </>
                )}
            </div>
            {onExplainDerivation && (
                <div className="mt-2.5 border-t pt-2">
                    <ExplainDerivationLink onClick={onExplainDerivation} />
                </div>
            )}
        </RailCard>
    );
}
