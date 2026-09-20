import type { MinutesData, MinutesSubject } from '@/lib/minutes/types';

/** A live present/absent count, at the roll call or at a later point in the meeting. */
export interface PresenceCount {
    present: number;
    absent: number;
}

/** The meeting's opening fact: who was present and who was absent at the roll call. */
export interface RollCall {
    count: PresenceCount | null;
    absentNames: string[];
    presentNames: string[];
}

/** A subject in the timeline, with the withdrawal time it carries — parent and child alike. */
export interface TimelineSubject {
    subject: MinutesSubject;
    /** The timestamp of this subject's procedural vote, when it was withdrawn and one exists. */
    withdrawnAt: number | null;
}

/**
 * One row of the discussion-order timeline:
 * - `presence` marks one observed attendance change: who arrived or left at
 *   `observedAtId`. Several `presence` items can share one `atSubjectId` anchor.
 * - `subject` is a discussed item — or a group of items discussed together,
 *   the parent plus its `children`.
 *
 * The roll call is not a row. It is `Timeline.rollCall`, so no reader has to
 * know it is the item at index 0 and re-check its type to use it.
 */
export type TimelineItem =
    | { type: 'presence'; atSubjectId: string; observedAtId: string; arrivals: string[]; departures: string[] }
    | ({ type: 'subject'; subjectId: string; children: TimelineSubject[] } & TimelineSubject);

export interface Timeline {
    rollCall: RollCall;
    items: TimelineItem[];
}

/** True when the transcript gives a discussion order: at least one subject has a start. */
export function hasDiscussionOrder(data: Pick<MinutesData, 'subjects'>): boolean {
    return data.subjects.some(s => s.discussion.start !== null);
}

/**
 * The discussion-order view: the roll call, then every non-child subject in
 * `data.subjects` order, with presence changes marked where they occur.
 *
 * A subject whose `discussedWith` names another top-level subject (one with
 * no `discussedWith` of its own) is folded into that subject's `children`
 * and is not an item of its own. A subject whose named parent is not itself
 * top-level — an orphan — keeps its own item, with no children.
 *
 * `atSubjectId` only decides where a presence row sits: a change observed at
 * a grouped child anchors to the child's parent, so the row still sits before
 * the parent's. `observedAtId` is where the change was actually observed, and
 * the names come from that observation.
 *
 * The roll call derives its count and both name lists from one pool — the
 * composition's members plus substitutes, which never includes the mayor
 * (shown separately). So an absentee outside the pool cannot make the count
 * and the lists disagree.
 */
export function buildTimeline(data: Pick<MinutesData, 'subjects' | 'attendanceChanges' | 'proceduralVotes' | 'absentMembers' | 'councilComposition'>): Timeline {
    const pool = data.councilComposition
        ? [...data.councilComposition.members, ...data.councilComposition.substituteMembers]
        : [];
    const absentIds = new Set((data.absentMembers ?? []).map(m => m.personId));
    const presentNames = pool.filter(m => !absentIds.has(m.personId)).map(m => m.name);
    const absentNames = pool.filter(m => absentIds.has(m.personId)).map(m => m.name);
    const rollCallCount: PresenceCount | null = data.councilComposition && data.absentMembers
        ? { present: presentNames.length, absent: absentNames.length }
        : null;

    const rollCall: RollCall = { count: rollCallCount, absentNames, presentNames };
    const items: TimelineItem[] = [];

    const topLevelIds = new Set(data.subjects.filter(s => s.discussedWith === null).map(s => s.subjectId));
    const isChild = (s: MinutesSubject): boolean => s.discussedWith !== null && topLevelIds.has(s.discussedWith.id);

    const childrenByParent = new Map<string, MinutesSubject[]>();
    const parentByChild = new Map<string, string>();
    for (const s of data.subjects) {
        if (isChild(s)) {
            const parentId = s.discussedWith!.id;
            const siblings = childrenByParent.get(parentId) ?? [];
            siblings.push(s);
            childrenByParent.set(parentId, siblings);
            parentByChild.set(s.subjectId, parentId);
        }
    }

    // Grouped by anchor, then by observed subject (insertion order), so several
    // children of one group each keep their own item instead of being folded
    // into one.
    const observationsByAnchor = new Map<string, Map<string, { arrivals: string[]; departures: string[] }>>();
    for (const change of data.attendanceChanges) {
        const observedAtId = change.atSubject.id;
        const anchorId = parentByChild.get(observedAtId) ?? observedAtId;
        const observations = observationsByAnchor.get(anchorId) ?? new Map<string, { arrivals: string[]; departures: string[] }>();
        const entry = observations.get(observedAtId) ?? { arrivals: [], departures: [] };
        (change.type === 'arrival' ? entry.arrivals : entry.departures).push(change.name);
        observations.set(observedAtId, entry);
        observationsByAnchor.set(anchorId, observations);
    }

    const votesBySubject = new Map(data.proceduralVotes.map(v => [v.subjectId, v]));

    const withdrawnAtById = new Map<string, number>();
    for (const s of data.subjects) {
        if (!s.withdrawn) continue;
        const vote = votesBySubject.get(s.subjectId);
        if (vote) withdrawnAtById.set(s.subjectId, vote.timestamp);
    }

    const timelineSubject = (s: MinutesSubject): TimelineSubject => ({
        subject: s,
        withdrawnAt: withdrawnAtById.get(s.subjectId) ?? null,
    });

    for (const s of data.subjects) {
        if (isChild(s)) continue;

        const observations = observationsByAnchor.get(s.subjectId);
        if (observations) {
            for (const [observedAtId, { arrivals, departures }] of observations) {
                items.push({ type: 'presence', atSubjectId: s.subjectId, observedAtId, arrivals, departures });
            }
        }

        items.push({
            type: 'subject',
            subjectId: s.subjectId,
            children: (childrenByParent.get(s.subjectId) ?? []).map(timelineSubject),
            ...timelineSubject(s),
        });
    }

    return { rollCall, items };
}

/**
 * Whether a subject is still waiting for its decision — the rule the page uses
 * to decide what it may ask a person about.
 *
 * A withdrawn subject was never going to get one, so it is not pending however
 * long it sits there. The action-item count, the work estimate and the routing
 * of a candidate onto a row all read this, or a tile would promise an answer
 * the row below it never offers.
 *
 * The same rule also lives in `resultKey` (`@/lib/utils/decisionResult`),
 * which returns `'none'` for exactly these subjects and `'withdrawn'` for the
 * ones this excludes. The two
 * are separate because they answer different questions — this one says whether
 * to ask, `resultKey` says what the Αποτέλεσμα column prints — and the table's
 * "without a decision" filter reads the column, not this. Change one and check
 * the other, or the count and the filtered list stop agreeing.
 */
export function isPendingDecision(subject: { withdrawn: boolean }, hasDecision: boolean): boolean {
    return !hasDecision && !subject.withdrawn;
}

/**
 * What the minutes document will carry, counted off the minutes snapshot
 * itself — the same snapshot the preview renders and the DOCX is built from.
 *
 * The card that shows this used to count the decisions payload instead. Both
 * payloads apply `isRecordSubject` and the same `isPendingDecision` rule, so
 * the two agree whenever they observed the same writes; they are separate
 * requests, so a failed or older decisions refresh made the card describe a
 * document other than the one its own buttons produce.
 */
export function minutesReadiness(data: Pick<MinutesData, 'subjects'>): { subjects: number; undecided: number } {
    const decidable = data.subjects.filter(s => !s.withdrawn);
    return {
        subjects: decidable.length,
        undecided: decidable.filter(s => isPendingDecision(s, s.decision !== null)).length,
    };
}
