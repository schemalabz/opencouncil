// Not in a "use server" file: every export there is a callable Server Action,
// and this writes a meeting without checking who asks.
import "server-only";
import type { AgendaMeetingInAgenda, AgendaMeetingRecord } from '@/lib/apiTypes';
import prisma from '@/lib/db/prisma';
import { describeMismatch, holdsAnotherMeeting, meetingsOfThisBody, SIBLING_WINDOW_MS, reconcileAgendaMeetingRecord, type AgendaRecordReconciliation, type SiblingCandidate } from '@/lib/agendaMeetingRecord';
import { updateMeetingRecord } from '@/lib/db/meetingLifecycle';
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules';
import { analyzeStoredName, storedNameLoss } from '@/lib/meetingRecordBackfill';
import { meetingNameInCity } from '@/lib/meetingName';
import { syncMeetingToCalendar } from '@/lib/google-calendar';
import { sendAgendaReadingAlert } from '@/lib/discord';

type MeetingForRecord = Parameters<typeof meetingNameInCity>[0] & {
    id: string;
    cityId: string;
    city: { name_en: string; timezone: string };
};

/**
 * Fills the kind, the urgency, the session number and the format that the
 * meeting record lacks from what the invitation states, through the
 * lifecycle rules. It never writes a name: the name is derived (#150).
 * A value the record already holds is compared, not overwritten: a difference
 * goes to the admins. The caller revalidates the meeting's cache; the
 * calendar event's title is the derived name, so it is synced here.
 *
 * Returns the fields it wrote, for the caller's copy of the meeting.
 */
export async function applyAgendaMeetingRecord(
    meeting: MeetingForRecord,
    read: AgendaMeetingRecord | null,
    meetingsInAgenda: AgendaMeetingInAgenda[],
    /** Differences from the identity check, for the same alert. */
    identityDifferences: string[],
) {
    // Read now, not when the callback started: saving the subjects takes
    // seconds, and an admin's edit in between must be compared, not overwritten.
    const current = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId: meeting.cityId, id: meeting.id } },
        select: {
            name: true, kind: true, urgent: true, sessionNumber: true, format: true, continuationOfId: true, postponedFromId: true,
            agendaUrl: true, dateTime: true, scheduleStatus: true,
            administrativeBodyId: true, administrativeBody: { select: { type: true, name: true, name_en: true } },
        },
    });
    if (!current) return {};

    // An agenda with several meetings is one record's, unless another record
    // holds the other meeting. Then the record is a combined meeting, which
    // keeps no kind, no urgency and no number until it is split (#150): a
    // λογοδοσία kind would also stop the decision polling of the regular
    // meeting beside it. It shows its stored name, or «Συνεδρίαση <date>».
    const combined = meetingsOfThisBody(meetingsInAgenda).length > 1 && !(await hasSiblingRecord(meeting, current));
    const ownRead = read && combined
        ? { ...read, kind: null, kindEvidence: null, urgent: null, urgentEvidence: null, sessionNumber: null, sessionNumberEvidence: null }
        : read;

    // The form always sends a format, so a new meeting holds a choice.
    const { patch, mismatches } = ownRead
        ? reconcileAgendaMeetingRecord({ ...current, bodyType: current.administrativeBody?.type ?? null }, ownRead, { formatChosen: true })
        : { patch: {}, mismatches: [] };
    const problems = [...identityDifferences, ...mismatches.map(describeMismatch)];
    if (meetingsInAgenda.length > 1) problems.unshift(describeMeetingsInAgenda(meetingsInAgenda, { combined }));
    if (combined && (current.kind !== null || current.urgent || current.sessionNumber !== null)) {
        problems.push(`this record holds one meeting's ${[current.kind && `kind ${current.kind}`, current.urgent && 'urgency', current.sessionNumber !== null && `number ${current.sessionNumber}`].filter(Boolean).join(', ')}, though it holds several meetings`);
    }
    // A kind replaces the stored name with the derived title. A name that says
    // more than that title («Δημοτική - Διαχειριστική Επιτροπή», «[Διεκόπη]»,
    // an «[Ακυρώθηκε]» the status does not hold) keeps showing until a person decides.
    if (patch.kind && current.kind === null && current.name) {
        const loss = storedNameLoss(analyzeStoredName(current.name, { bodyName: current.administrativeBody?.name ?? null }), {
            kind: patch.kind, urgent: patch.urgent ?? current.urgent, sessionNumber: patch.sessionNumber ?? current.sessionNumber,
            scheduleStatus: current.scheduleStatus,
        });
        if (loss) {
            problems.push(`kind ${patch.kind} not written: the stored name «${current.name}» says more than the derived title would (${loss})`);
            delete patch.kind;
        }
    }

    let written: AgendaRecordReconciliation['patch'] = {};
    if (Object.keys(patch).length > 0) {
        try {
            await updateMeetingRecord(meeting.cityId, meeting.id, patch);
            written = patch;
            console.log(`processAgenda filled the meeting record of ${meeting.cityId}/${meeting.id}: ${JSON.stringify(patch)}`);
        } catch (error) {
            if (!(error instanceof LifecycleRuleError)) throw error;
            problems.push(`not written, the rules of the record refuse it (${error.code}): ${JSON.stringify(patch)}`);
        }
    }
    if (written.kind !== undefined || written.urgent !== undefined || written.sessionNumber !== undefined) {
        await syncMeetingToCalendar(meeting.cityId, meeting.id);
    }
    if (problems.length > 0) {
        console.warn(`processAgenda: the agenda of ${meeting.cityId}/${meeting.id} needs a look: ${problems.join('; ')}`);
        sendAgendaReadingAlert({
            cityId: meeting.cityId,
            cityName: meeting.city.name_en,
            meetingId: meeting.id,
            meetingName: meetingNameInCity({ ...meeting, ...written }, 'el'),
            problems,
        }).catch((error) => console.error('Failed to send the agenda alert:', error));
    }
    return written;
}

/**
 * The platform keeps one meeting per record, so every subject of the agenda
 * was saved on this one: an admin decides whether the other meetings need
 * their own records.
 */
export function describeMeetingsInAgenda(meetings: AgendaMeetingInAgenda[], { combined }: { combined: boolean }): string {
    const listed = meetings.map((m, i) =>
        `${m.isThisMeeting ? '→ ' : ''}#${i + 1} ${m.bodyName ?? '?'}${m.time ? ` ${m.time}` : ''}: ${m.kind ?? 'kind unknown'}${m.urgent ? ' (urgent)' : ''}${m.sessionNumber ? ` #${m.sessionNumber}` : ''}, ${m.subjectCount} subjects`,
    ).join('; ');
    const total = meetings.reduce((n, m) => n + m.subjectCount, 0);
    const ours = meetings.some((m) => m.isThisMeeting) ? '' : ' (which one is this meeting could not be told)';
    const record = combined
        ? 'no other record holds the others, so this one is kept as a combined meeting, with no kind, no urgency and no number, until it is split'
        : meetingsOfThisBody(meetings).length > 1
            ? 'another record of the same body holds another of them'
            : "the others are other bodies' meetings";
    return `the agenda holds ${meetings.length} meetings${ours}, and all ${total} subjects were saved on this one; ${record}: ${listed}`;
}

/**
 * Another record of the same body that holds the agenda's other meeting
 * (`holdsAnotherMeeting`). A record with no body is the council's, so the
 * council's records and the body-less ones are one body here.
 */
async function hasSiblingRecord(
    meeting: { cityId: string; id: string },
    current: Omit<SiblingCandidate, 'id'> & { administrativeBodyId: string | null; administrativeBody: { type: string } | null },
): Promise<boolean> {
    const council = (current.administrativeBody?.type ?? 'council') === 'council';
    const candidates = await prisma.councilMeeting.findMany({
        where: {
            cityId: meeting.cityId,
            id: { not: meeting.id },
            ...(council
                ? { OR: [{ administrativeBodyId: null }, { administrativeBody: { type: 'council' } }] }
                : { administrativeBodyId: current.administrativeBodyId }),
            AND: [{
                OR: [
                    ...(current.agendaUrl ? [{ agendaUrl: current.agendaUrl }] : []),
                    { dateTime: { gte: new Date(current.dateTime.getTime() - SIBLING_WINDOW_MS), lte: new Date(current.dateTime.getTime() + SIBLING_WINDOW_MS) } },
                ],
            }],
        },
        select: { id: true, agendaUrl: true, dateTime: true, scheduleStatus: true, continuationOfId: true, postponedFromId: true },
    });
    return candidates.some((other) => holdsAnotherMeeting({ id: meeting.id, ...current }, other));
}
