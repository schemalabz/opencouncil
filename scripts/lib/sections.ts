/**
 * The shape `decisions sections` prints: a meeting's discussion order and its
 * transcript sections, as the minutes print them.
 *
 * `meetingSections` is pure. It runs the production functions that the minutes
 * run (`minutesSections`, `discussionOrderLabel`, `discussedElsewhereIds`) on the
 * subjects and the utterances only, so its loader needs no other column and
 * works on any schema. `describeSections` takes the order, the windows and the
 * assignment as inputs: a caller that compares two versions of the rules
 * passes its own.
 */
import { Prisma } from '@prisma/client';
import {
    discussedElsewhereIds,
    discussionOrderLabel,
    discussionOrderPositions,
    minutesSections,
} from '@/lib/minutes/builders';
import type { AssignmentResult, TemporalWindow } from '@/lib/minutes/temporalWindows';
import { agendaItemTitleOrName } from '@/lib/utils/subjects';

const subjectFields = { id: true, name: true, agendaItemTitle: true, agendaItemIndex: true, nonAgendaReason: true, withdrawn: true } as const;

export const sectionsSubjectSelect = {
    ...subjectFields,
    discussedIn: { select: subjectFields },
} satisfies Prisma.SubjectSelect;

export const sectionsUtteranceSelect = {
    id: true,
    text: true,
    startTimestamp: true,
    endTimestamp: true,
    discussionSubjectId: true,
    discussionStatus: true,
    speakerSegment: { select: { speakerTag: { select: { label: true, personId: true, person: { select: { name_short: true } } } } } },
} satisfies Prisma.UtteranceSelect;

export type SectionsSubject = Prisma.SubjectGetPayload<{ select: typeof sectionsSubjectSelect }>;
export type SectionsUtterance = Prisma.UtteranceGetPayload<{ select: typeof sectionsUtteranceSelect }>;

/** Another subject, as a note names it. */
export interface SubjectRef {
    /** The label in the order line («5ο», «ΕΗΔ1»), else «Nο» from the agenda index. */
    label: string;
    subjectId: string;
    name: string;
}

export interface SectionLine {
    at: number;
    speaker: string;
    text: string;
}

export interface MeetingSection {
    label: string;
    subjectId: string;
    agendaItemIndex: number | null;
    outOfAgenda: boolean;
    name: string;
    /** The section's temporal windows, in time order. More than one when the subject was left pending and resumed. */
    windows: Array<{ start: number; end: number }>;
    /** Untagged utterances printed before the heading (the lead-in). */
    leadIn: number;
    /** Utterances printed under the heading. */
    utterances: number;
    /** «Συζητήθηκε μαζί με …»: the stored `discussedIn` link. */
    discussedWith: SubjectRef | null;
    /** «Μέρος της συζήτησης πραγματοποιήθηκε κατά τη συζήτηση …»: sections that hold utterances tagged to this subject. */
    discussedElsewhere: SubjectRef[];
    /** Where a later window of the section starts a new block. */
    resumedAt: number[];
    /** The first two utterances under the heading. */
    first: SectionLine[];
}

export interface MeetingSections {
    meeting: string;
    /** The «Σειρά συζήτησης» line; null when the meeting followed the agenda. */
    order: string | null;
    utterances: number;
    preamble: number;
    epilogue: number;
    withdrawn: string[];
    sections: MeetingSection[];
}

type Assignment = Pick<AssignmentResult, 'utterancesBySubject' | 'crossSubjectMap' | 'preDiscussionByIndex' | 'preambleUtterances' | 'epilogueUtterances' | 'resumedAt'>;

const LINE_LENGTH = 100;

function line(u: SectionsUtterance): SectionLine {
    const tag = u.speakerSegment.speakerTag;
    const text = u.text.replace(/\s+/g, ' ').trim();
    return {
        at: u.startTimestamp,
        speaker: tag.person?.name_short ?? tag.label ?? 'Ομιλητής',
        text: text.length > LINE_LENGTH ? `${text.slice(0, LINE_LENGTH)}…` : text,
    };
}

/**
 * The sections of the given order, windows and assignment. `ordered` is the
 * record subjects in printed order, withdrawn ones included (the minutes list
 * them only in the table of contents).
 */
export function describeSections(
    meeting: string,
    ordered: SectionsSubject[],
    utterances: SectionsUtterance[],
    windows: TemporalWindow[],
    assignment: Assignment,
): MeetingSections {
    const active = ordered.filter(s => !s.withdrawn);
    const positions = discussionOrderPositions(active);
    const labelById = new Map(active.map((s, i) => [s.id, positions[i].label]));
    const byId = new Map(ordered.map(s => [s.id, s]));
    const ref = (s: Omit<SectionsSubject, 'discussedIn'>): SubjectRef => ({
        label: labelById.get(s.id) ?? (s.agendaItemIndex === null ? '' : `${s.agendaItemIndex}ο`),
        subjectId: s.id,
        name: agendaItemTitleOrName(s),
    });

    const sections = active.map((s, i): MeetingSection => {
        const ownIds = new Set((assignment.utterancesBySubject.get(s.id) ?? []).map(u => u.id));
        const own = utterances.filter(u => ownIds.has(u.id));
        return {
            label: positions[i].label,
            subjectId: s.id,
            agendaItemIndex: s.agendaItemIndex,
            outOfAgenda: s.nonAgendaReason === 'outOfAgenda',
            name: agendaItemTitleOrName(s),
            windows: windows.filter(w => w.subjectId === s.id).map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start),
            leadIn: assignment.preDiscussionByIndex.get(i)?.length ?? 0,
            utterances: own.length,
            discussedWith: s.discussedIn ? ref(s.discussedIn) : null,
            discussedElsewhere: discussedElsewhereIds(s.id, assignment.crossSubjectMap).flatMap(id => {
                const owner = byId.get(id);
                return owner ? [ref(owner)] : [];
            }),
            resumedAt: own.filter(u => assignment.resumedAt.has(u.id)).map(u => u.startTimestamp),
            first: own.slice(0, 2).map(line),
        };
    });

    return {
        meeting,
        order: discussionOrderLabel(active),
        utterances: utterances.length,
        preamble: assignment.preambleUtterances.length,
        epilogue: assignment.epilogueUtterances.length,
        withdrawn: ordered.filter(s => s.withdrawn).map(s => s.nonAgendaReason === 'outOfAgenda' ? `ΕΗΔ «${agendaItemTitleOrName(s)}»` : `${s.agendaItemIndex}ο`),
        sections,
    };
}

/**
 * A meeting's order and sections, as `getMinutesData` computes them.
 * `utterances` are all the meeting's utterances, sorted by start.
 */
export function meetingSections(meeting: string, subjects: SectionsSubject[], utterances: SectionsUtterance[]): MeetingSections {
    const { ordered, windows, assignment } = minutesSections(subjects, utterances);
    return describeSections(meeting, ordered, utterances, windows, assignment);
}

const seconds = (t: number) => t.toFixed(1);

/** A subject a note names: its label, or its name when it has no number. */
const refText = (r: SubjectRef) => r.label || `«${r.name}»`;

/** The text form of `decisions sections`. */
export function formatMeetingSections(m: MeetingSections): string {
    const lines = [
        `${m.meeting}: ${m.utterances} utterances, preamble ${m.preamble}, epilogue ${m.epilogue}`,
        m.order ? `Σειρά συζήτησης: ${m.order}` : 'Σειρά συζήτησης: ακολουθεί την ημερήσια διάταξη',
    ];
    if (m.withdrawn.length) lines.push(`withdrawn: ${m.withdrawn.join(', ')}`);
    for (const s of m.sections) {
        const windows = s.windows.length ? s.windows.map(w => `${seconds(w.start)}–${seconds(w.end)}`).join(' | ') : 'no window';
        lines.push('', `${s.label ? `${s.label} ` : ''}«${s.name}»`, `  windows ${windows}; ${s.utterances} utterances${s.leadIn ? `, lead-in ${s.leadIn}` : ''}`);
        if (s.discussedWith) lines.push(`  discussed with ${refText(s.discussedWith)}`);
        if (s.discussedElsewhere.length) lines.push(`  discussed elsewhere: ${s.discussedElsewhere.map(refText).join(', ')}`);
        if (s.resumedAt.length) lines.push(`  resumed at ${s.resumedAt.map(seconds).join(', ')}`);
        for (const l of s.first) lines.push(`  ${seconds(l.at)} ${l.speaker}: ${l.text}`);
    }
    return lines.join('\n') + '\n';
}
