import type { AdministrativeBodyType, MeetingFormat, MeetingKind, MeetingScheduleStatus } from '@prisma/client';
import { asMeetingKind } from '@opencouncil/ui/lib/meeting-title';
import { COUNCIL_ONLY_KINDS } from '@/lib/meetingLifecycleRules';
import type { AgendaMeetingInAgenda, AgendaMeetingRecord } from '@/lib/apiTypes';

/**
 * How the meeting record that processAgenda reads from the invitation meets
 * the record we hold. The invitation fills what we do not know; where we
 * already hold a value and the invitation says otherwise, nothing changes and
 * a person is told, because either side can be the wrong one.
 */

export type AgendaRecordField = 'kind' | 'urgent' | 'sessionNumber' | 'format';

export interface RecordedMeeting {
    kind: MeetingKind | null;
    urgent: boolean;
    sessionNumber: number | null;
    /** Null once the format may be left empty at creation (#150 follow-up): the invitation fills it. */
    format: MeetingFormat | null;
    continuationOfId: string | null;
    /** null: a meeting with no body, which reads as the council's everywhere. */
    bodyType: AdministrativeBodyType | null;
}

export interface AgendaRecordMismatch {
    field: AgendaRecordField;
    recorded: string | number | boolean | null;
    read: string | number | boolean;
    evidence: string | null;
}

export interface AgendaRecordReconciliation {
    patch: { kind?: MeetingKind; urgent?: true; sessionNumber?: number; format?: MeetingFormat };
    mismatches: AgendaRecordMismatch[];
}

/**
 * What the reconciliation reads. `urgent` is null where it must not be
 * compared (a combined record), and absent from a task older than the flag.
 */
export type ReadMeetingRecord = Omit<AgendaMeetingRecord, 'urgent'> & { urgent?: boolean | null };

/**
 * `formatChosen` says whether a person chose the format. The column defaults
 * to in person, so an archive meeting holds the default, not a choice, and the
 * invitation may fill it; a meeting from the form holds a choice. A null
 * format is filled either way.
 */
export function reconcileAgendaMeetingRecord(
    recorded: RecordedMeeting,
    read: ReadMeetingRecord,
    { formatChosen }: { formatChosen: boolean },
): AgendaRecordReconciliation {
    const patch: AgendaRecordReconciliation['patch'] = {};
    const mismatches: AgendaRecordMismatch[] = [];
    // The rules of the record refuse a council-only kind on another body;
    // it is reported instead, like a difference.
    const council = recorded.bodyType === null || recorded.bodyType === 'council';

    // A later part of a meeting has no kind, no urgency and no number: its first part holds them.
    if (!recorded.continuationOfId) {
        // processAgenda and the app deploy separately, so the task can name a
        // kind that this platform does not have yet: reported, never written.
        const known = asMeetingKind(read.kind);
        if (read.kind !== null && known === null) {
            mismatches.push({ field: 'kind', recorded: recorded.kind, read: `${read.kind} (unknown to this version of the platform)`, evidence: read.kindEvidence });
        } else if (known !== null) {
            if (recorded.kind === null && (council || !COUNCIL_ONLY_KINDS.has(known))) patch.kind = known;
            else if (recorded.kind !== known) mismatches.push({ field: 'kind', recorded: recorded.kind, read: known, evidence: read.kindEvidence });
        }
        // `urgent` defaults to false, so a false urgency is not a statement:
        // the invitation sets it, and only an urgency the invitation does not
        // state is reported.
        if (read.urgent === true && !recorded.urgent) patch.urgent = true;
        else if (read.urgent === false && recorded.urgent) mismatches.push({ field: 'urgent', recorded: true, read: false, evidence: null });
        if (read.sessionNumber !== null) {
            if (recorded.sessionNumber === null) patch.sessionNumber = read.sessionNumber;
            else if (recorded.sessionNumber !== read.sessionNumber) mismatches.push({ field: 'sessionNumber', recorded: recorded.sessionNumber, read: read.sessionNumber, evidence: read.sessionNumberEvidence });
        }
    }

    if (read.format !== null && read.format !== recorded.format) {
        if (recorded.format === null || !formatChosen) patch.format = read.format;
        else mismatches.push({ field: 'format', recorded: recorded.format, read: read.format, evidence: read.formatEvidence });
    }

    return { patch, mismatches };
}

export function describeMismatch(m: AgendaRecordMismatch): string {
    if (m.field === 'urgent') return 'urgent: recorded urgent, the invitation does not say urgent';
    return `${m.field}: recorded ${m.recorded ?? 'none'}, invitation says ${m.read}${m.evidence ? ` («${m.evidence}»)` : ''}`;
}

/**
 * Lower case, no accents, final sigma folded, any dash a space, «Δήμος» or
 * «Δήμου» dropped: «ΔΗΜΟΣ ΑΡΓΟΥΣ - ΜΥΚΗΝΩΝ» is «Δήμος Άργους–Μυκηνών».
 */
export function foldMunicipality(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ')
        .replace(/[\s\-–—−]+/g, ' ').trim().replace(/^δημο[υσ] /, '');
}

/** The agenda's meetings of this meeting's body, as processAgenda marks them (`ofThisBody`). */
export function meetingsOfThisBody<T extends { ofThisBody: boolean | null }>(meetings: T[]): T[] {
    return meetings.filter((m) => m.ofThisBody === true);
}

export interface AgendaIdentity {
    /** The agenda is another municipality's: it must not be saved. */
    refusal: string | null;
    /** Differences a person should see; the agenda is saved. */
    differences: string[];
}

/**
 * Whether the agenda is this meeting's. Only positive evidence refuses: the
 * printed municipality is another city's. A printed municipality that is
 * neither ours nor another city's is a typo or a misreading («Ευροστίνης»),
 * and a body the agenda calls otherwise is as often the reader's mistake (the
 * hall, «αίθουσα Δημοτικού Συμβουλίου», read as the body) as a wrong
 * document: both are reported and the agenda is saved. The date and the time
 * never refuse either: our own records are wrong more often than the
 * invitation (an archive time of 00:00, a meeting stored a day late).
 */
export function checkAgendaIdentity(
    meeting: { municipality: string; date: string; time: string },
    meetingsInAgenda: AgendaMeetingInAgenda[],
    /** The municipalities of the platform's other cities. */
    otherMunicipalities: string[],
): AgendaIdentity {
    const differences: string[] = [];
    const want = foldMunicipality(meeting.municipality);
    const printed = [...new Set(meetingsInAgenda.map((m) => m.municipality).filter((m): m is string => Boolean(m)))];
    if (printed.length > 0 && !printed.some((m) => foldMunicipality(m) === want)) {
        const others = new Set(otherMunicipalities.map(foldMunicipality).filter((m) => m !== want));
        const other = printed.find((m) => others.has(foldMunicipality(m)));
        if (other) return { refusal: `the agenda is from ${other}, not ${meeting.municipality}`, differences };
        differences.push(`municipality: the agenda prints ${printed.join(', ')}, the city is ${meeting.municipality}`);
    }
    const marked = meetingsInAgenda.filter((m) => m.ofThisBody !== null);
    if (marked.length > 0 && !marked.some((m) => m.ofThisBody)) {
        differences.push(`body: the agenda calls ${marked.map((m) => m.bodyName).join(', ')}, not this meeting's body`);
    }
    const own = meetingsInAgenda.find((m) => m.isThisMeeting);
    if (own?.date && own.date !== meeting.date) differences.push(`date: recorded ${meeting.date}, invitation says ${own.date}`);
    if (own?.time && own.time !== meeting.time) differences.push(`time: recorded ${meeting.time}, invitation says ${own.time}`);
    return { refusal: null, differences };
}

/** What tells a record that holds the agenda's other meeting from a record of the same meeting. */
export interface SiblingCandidate {
    id: string;
    agendaUrl: string | null;
    dateTime: Date;
    scheduleStatus: MeetingScheduleStatus;
    continuationOfId: string | null;
    postponedFromId: string | null;
}

/** 18 hours either side, so that the city's timezone does not matter. */
export const SIBLING_WINDOW_MS = 18 * 60 * 60 * 1000;

/**
 * Whether `other`, a record of the same body, can hold the agenda's other
 * meeting: it is from the same agenda or the same day, and it is not a record
 * of this meeting. The meeting this one was postponed from or to, a later
 * part of a meeting, and a postponed or cancelled record hold the same
 * meeting, not the other one.
 */
export function holdsAnotherMeeting(meeting: SiblingCandidate, other: SiblingCandidate): boolean {
    if (other.id === meeting.id) return false;
    if (other.scheduleStatus !== 'scheduled' || other.continuationOfId !== null) return false;
    if (other.postponedFromId === meeting.id || other.id === meeting.postponedFromId) return false;
    if (other.id === meeting.continuationOfId) return false;
    return (meeting.agendaUrl !== null && other.agendaUrl === meeting.agendaUrl)
        || Math.abs(other.dateTime.getTime() - meeting.dateTime.getTime()) <= SIBLING_WINDOW_MS;
}
