/**
 * Read-only report for the reviewed backfill of the meeting record (#150).
 *
 * The kind, the urgency, the session number and the format of an archive
 * meeting come from its invitation, which processAgenda reads
 * (opencouncil-tasks `read-meeting-records`, fed by
 * scripts/meeting-record-export.ts). The stored names carry what now has its
 * own column: «[Ακυρώθηκε]» is a status, «Λογοδοσίας» is a kind. A postponed
 * meeting is told from a cancelled one by the next meeting of its body: the
 * new meeting after a postponement holds the same number, and the apply links
 * it. This script
 * proposes a value for each column and writes a CSV. A person reviews
 * each row and writes `yes` in the `apply` column; then
 * scripts/meeting-lifecycle-apply.ts writes the accepted rows.
 *
 *   npx tsx scripts/meeting-lifecycle-report.ts --records reports/meeting-records.json --out reports/meeting-lifecycle.csv
 *   npx tsx scripts/meeting-lifecycle-report.ts --records reports/meeting-records.json --only-read
 *
 * The invitation fills a value the record lacks; a value the record holds is
 * compared, and a difference lands in `invitationDiffers`. The name is the
 * fallback for a kind or an urgency the invitation does not give. No name is
 * written (#150): `storedNameLoses` says what a name says that the derived
 * name would not, the check before a migration drops the names. The script
 * writes nothing to the database.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import prisma from '@/lib/db/prisma';
import { formatDateAsMeetingId } from '@/lib/utils/meetingId';
import { formatClockTime, localCalendarDate } from '@/lib/formatters/time';
import { analyzeStoredName, postponementInInvitation, storedNameLoss } from '@/lib/meetingRecordBackfill';
import { checkAgendaIdentity, describeMismatch, holdsAnotherMeeting, meetingsOfThisBody, reconcileAgendaMeetingRecord } from '@/lib/agendaMeetingRecord';
import { COUNCIL_ONLY_KINDS, recordsGreekCodeFacts } from '@/lib/meetingLifecycleRules';
import { takesNoDecisions } from '@/lib/tasks/pollDecisionsBackoff';
import type { AgendaMeetingInAgenda, AgendaMeetingRecord } from '@/lib/apiTypes';
import { REPORT_COLUMNS, assertNotProduction, toCsvLine, type ReportRow } from './lib/meetingLifecycleCsv';

/** One meeting of the output of opencouncil-tasks `read-meeting-records`. */
interface RecordRead {
    cityId: string;
    meetingId: string;
    record: AgendaMeetingRecord | null;
    /** Every meeting the agenda calls; more than one is a record that holds several. */
    meetings?: Omit<AgendaMeetingInAgenda, 'subjectCount' | 'isThisMeeting'>[];
    /** The position in `meetings` of this meeting; null when it could not be told. */
    thisMeeting?: number | null;
    warnings: { code: string; message: string }[];
    error?: string;
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('out', { type: 'string', default: 'reports/meeting-lifecycle.csv', describe: 'Where to write the CSV' })
        .option('city', { type: 'string', describe: 'Only the meetings of this city id' })
        .option('records', { type: 'string', describe: 'The meeting records read from the invitations (opencouncil-tasks read-meeting-records)' })
        .option('only-read', { type: 'boolean', default: false, describe: 'Only the meetings whose invitation the records file holds' })
        .option('i-know-this-is-production', { type: 'boolean', default: false })
        .strict()
        .parse();
    assertNotProduction(argv['i-know-this-is-production']);

    const reads = new Map<string, RecordRead>();
    if (argv.records) {
        for (const r of (JSON.parse(fs.readFileSync(argv.records, 'utf8')) as { meetings: RecordRead[] }).meetings) {
            reads.set(`${r.cityId}/${r.meetingId}`, r);
        }
    }

    // The kind, the urgency and the number are facts of the Greek Code
    // (`recordsGreekCodeFacts`): a city of another realm is not proposed any.
    const allMeetings = (await prisma.councilMeeting.findMany({
        where: argv.city ? { cityId: argv.city } : {},
        select: {
            id: true, cityId: true, name: true, name_en: true, dateTime: true, agendaUrl: true, administrativeBodyId: true,
            scheduleStatus: true, kind: true, urgent: true, sessionNumber: true, format: true, continuationOfId: true, postponedFromId: true,
            administrativeBody: { select: { name: true, type: true } },
            city: { select: { timezone: true, realm: true, name_municipality: true } },
        },
        orderBy: [{ cityId: 'asc' }, { dateTime: 'asc' }],
    })).filter((m) => recordsGreekCodeFacts(m.city.realm));
    // The identity check of the processAgenda callback refuses an agenda that names another city.
    const municipalities = (await prisma.city.findMany({ where: { realm: 'greece' }, select: { id: true, name_municipality: true } }));

    // The meetings of each body, to tell a combined record from one whose
    // other meeting has a record of its own, as the processAgenda callback
    // does. Built before --only-read narrows the rows: the other meeting's
    // record may have no agenda of its own.
    // A record with no body is the council's, so the two group together.
    const bodyKey = (m: typeof allMeetings[number]) => `${m.cityId}/${(m.administrativeBody?.type ?? 'council') === 'council' ? 'council' : m.administrativeBodyId}`;
    const ofSameBody = new Map<string, typeof allMeetings>();
    for (const m of allMeetings) ofSameBody.set(bodyKey(m), [...(ofSameBody.get(bodyKey(m)) ?? []), m]);
    const hasSibling = (m: typeof allMeetings[number]) => (ofSameBody.get(bodyKey(m)) ?? []).some((o) => holdsAnotherMeeting(m, o));
    const meetings = allMeetings.filter((m) => !argv['only-read'] || reads.has(`${m.cityId}/${m.id}`));

    // The rules link a postponed meeting to a later meeting of the same body.
    const exactBodyKey = (m: typeof allMeetings[number]) => `${m.cityId}/${m.administrativeBodyId ?? '-'}`;
    const ofExactBody = new Map<string, typeof allMeetings>();
    for (const m of allMeetings) ofExactBody.set(exactBodyKey(m), [...(ofExactBody.get(exactBodyKey(m)) ?? []), m]);
    const linkedTo = new Map(allMeetings.filter((m) => m.postponedFromId).map((m) => [`${m.cityId}/${m.postponedFromId}`, m.id]));
    const invitationText = (read?: RecordRead) => [read?.record?.kindEvidence, read?.record?.sessionNumberEvidence].filter(Boolean).join(' ');
    /**
     * The meeting that took over a postponed one: the next meeting of the same
     * body within 60 days that holds the same number, which the law keeps for
     * a postponed meeting, or whose invitation says it follows a postponement.
     */
    const newMeetingAfter = (meeting: typeof allMeetings[number], sessionNumber: number | null) => {
        const later = (ofExactBody.get(exactBodyKey(meeting)) ?? []).filter((o) => o.dateTime > meeting.dateTime
            && o.dateTime.getTime() - meeting.dateTime.getTime() <= 60 * 24 * 3600 * 1000 && !o.postponedFromId && !o.continuationOfId);
        for (const o of later) {
            const read = reads.get(`${o.cityId}/${o.id}`);
            if (sessionNumber !== null && read?.record?.sessionNumber === sessionNumber) {
                return { id: o.id, sameNumber: true, evidence: `${o.id} holds the same number: «${read.record.sessionNumberEvidence ?? sessionNumber}»` };
            }
            if (postponementInInvitation(invitationText(read)) === 'after') {
                return { id: o.id, sameNumber: false, evidence: `${o.id}: «${invitationText(read)}»` };
            }
        }
        return null;
    };
    // Decisions per meeting: a kind the decision poll skips must not silence a meeting that has them.
    const decisionRows = await prisma.$queryRaw<{ cityId: string; meetingId: string; n: bigint }[]>`
        SELECT s."cityId", s."councilMeetingId" AS "meetingId", COUNT(*) AS n
        FROM "Decision" d JOIN "Subject" s ON s.id = d."subjectId" GROUP BY 1, 2`;
    const decisions = new Map(decisionRows.map((r) => [`${r.cityId}/${r.meetingId}`, Number(r.n)]));

    const rows: ReportRow[] = [];
    const counts = { nameLoses: 0, cancelled: 0, postponed: 0, linked: 0, kind: 0, urgent: 0, format: 0, sessionNumber: 0, differs: 0, review: 0 };
    for (const meeting of meetings) {
        const localDate = localCalendarDate(meeting.dateTime, meeting.city.timezone);
        const analysis = meeting.name ? analyzeStoredName(meeting.name, { bodyName: meeting.administrativeBody?.name ?? null }) : null;
        const read = reads.get(`${meeting.cityId}/${meeting.id}`);
        const inAgenda = (read?.meetings ?? []).map((m, i) => ({ ...m, subjectCount: 0, isThisMeeting: i === read?.thisMeeting }));
        const identity = inAgenda.length > 0
            ? checkAgendaIdentity({
                municipality: meeting.city.name_municipality,
                date: localDate,
                time: formatClockTime(meeting.dateTime, meeting.city.timezone),
            }, inAgenda, municipalities.filter((c) => c.id !== meeting.cityId).map((c) => c.name_municipality))
            : { refusal: null, differences: [] };
        // A record of two meetings keeps no kind, no urgency and no number (#150), as in
        // the processAgenda callback: by its name, or by an agenda that holds
        // several meetings of this body when no other record holds them.
        const agendaCombined = meetingsOfThisBody(inAgenda).length > 1 && !hasSibling(meeting);
        const combined = analysis?.combined === true || agendaCombined;
        // An agenda the callback would refuse proposes nothing.
        const invitation = identity.refusal ? null : read?.record && combined
            ? { ...read.record, kind: null, kindEvidence: null, urgent: null, urgentEvidence: null, sessionNumber: null, sessionNumberEvidence: null }
            : read?.record ?? null;
        const { patch, mismatches } = invitation
            ? reconcileAgendaMeetingRecord({ ...meeting, bodyType: meeting.administrativeBody?.type ?? null }, invitation, { formatChosen: false })
            : { patch: {}, mismatches: [] };

        // The invitation names the kind; the name is the fallback for a
        // meeting whose invitation was not read or names no kind. A later
        // part of a meeting has no kind of its own.
        const nameKindRead = invitation?.kind || meeting.continuationOfId || combined ? null : analysis?.proposedKind ?? null;
        // The rules refuse a council-only kind on another body; a name that says
        // λογοδοσία on a committee's record is a record on the wrong body, for a person.
        const council = !meeting.administrativeBody || meeting.administrativeBody.type === 'council';
        const nameKindRefused = nameKindRead !== null && !council && COUNCIL_ONLY_KINDS.has(nameKindRead);
        const nameKind = nameKindRefused ? null : nameKindRead;
        const proposedKind = meeting.kind ?? patch.kind ?? nameKind;
        // The invitation says whether the meeting is urgent; the name is the
        // fallback when no invitation was read.
        const nameUrgent = !invitation && !meeting.continuationOfId && !combined && analysis?.urgent === true;
        const proposedUrgent = meeting.urgent || patch.urgent === true || nameUrgent;
        const proposedSessionNumber = meeting.sessionNumber ?? patch.sessionNumber ?? null;
        const proposedFormat = patch.format ?? meeting.format;

        // The name or a notice of postponement says that the meeting did not
        // take place. The next meeting tells a postponement from a cancellation.
        // A status the record holds is kept.
        const notice = postponementInInvitation(invitationText(read)) === 'notice';
        const statusRead = analysis?.proposedStatus ?? (notice ? 'postponed' : null);
        const currentPostponedTo = linkedTo.get(`${meeting.cityId}/${meeting.id}`) ?? null;
        const successor = !currentPostponedTo && (statusRead || meeting.scheduleStatus === 'postponed')
            ? newMeetingAfter(meeting, proposedSessionNumber) : null;
        const postponedNotCancelled = statusRead === 'cancelled' && successor?.sameNumber === true;
        const proposedStatus = meeting.scheduleStatus !== 'scheduled' ? meeting.scheduleStatus
            : postponedNotCancelled ? 'postponed' : statusRead ?? 'scheduled';
        const proposedPostponedTo = currentPostponedTo ?? (proposedStatus === 'postponed' ? successor?.id ?? null : null);

        const nameLoses = analysis ? storedNameLoss(analysis, { kind: proposedKind, urgent: proposedUrgent, sessionNumber: proposedSessionNumber, scheduleStatus: proposedStatus }) : null;

        const meetingsInAgenda = read?.meetings ?? [];
        const otherMeetings = meetingsInAgenda.length > 1
            ? `agenda holds ${meetingsInAgenda.length} meetings: ${meetingsInAgenda.map((m) => `${m.bodyName ?? '?'}${m.time ? ` ${m.time}` : ''} ${m.kind ?? '?'}${m.urgent ? ' urgent' : ''}${m.sessionNumber ? ` #${m.sessionNumber}` : ''}`).join(' | ')}`
            : null;
        const idDate = formatDateAsMeetingId(new Date(`${localDate}T12:00:00Z`));
        const notes = [
            analysis?.note,
            analysis?.combined ? 'combined' : null,
            analysis?.interrupted ? 'interrupted' : null,
            notice ? 'the invitation postpones this meeting' : null,
            postponedNotCancelled ? `postponed, not cancelled: ${successor!.id} holds the same number` : null,
            analysis?.proposedKind && invitation?.kind && analysis.proposedKind !== invitation.kind ? `name says ${analysis.proposedKind}` : null,
            read?.error ? `invitation not read: ${read.error}` : null,
            ...identity.differences,
            otherMeetings,
        ].filter(Boolean);
        const invitationDiffers = mismatches.map(describeMismatch).join('; ');
        // What a person should look at before writing `yes`.
        const review = [
            invitationDiffers ? 'invitation differs' : null,
            identity.refusal ? `agenda refused: ${identity.refusal}` : read && !read.record ? 'invitation not read' : null,
            // A kind replaces the stored name with the derived title.
            !meeting.kind && proposedKind && nameLoses ? `the stored name says more than the derived title (${nameLoses})` : null,
            agendaCombined ? 'a combined meeting' : null,
            nameKindRefused ? `the name says ${nameKindRead}, which a ${meeting.administrativeBody?.type} does not hold` : null,
            // The backfill gives a later part no kind, so the meeting's own kind is the one that changes.
            !takesNoDecisions({ kind: meeting.kind, continuationOf: null }) && takesNoDecisions({ kind: proposedKind, continuationOf: null })
                && (decisions.get(`${meeting.cityId}/${meeting.id}`) ?? 0) > 0
                ? `decisions on a meeting the decision poll would skip (${decisions.get(`${meeting.cityId}/${meeting.id}`)})` : null,
            // The agenda may show one meeting while the stream held two (a λογοδοσία invitation is often its own document).
            analysis?.combined ? 'the name says two meetings' : null,
            (read?.warnings ?? []).some((w) => w.code !== 'MULTIPLE_MEETINGS') ? 'warnings' : null,
            proposedStatus !== meeting.scheduleStatus || proposedPostponedTo !== currentPostponedTo ? 'status' : null,
            !meeting.kind && !patch.kind && proposedKind ? 'kind from the name only' : null,
            nameUrgent && !meeting.urgent ? 'urgency from the name only' : null,
        ].filter(Boolean).join(', ');

        rows.push({
            cityId: meeting.cityId,
            id: meeting.id,
            localDate,
            bodyName: meeting.administrativeBody?.name ?? '',
            bodyType: meeting.administrativeBody?.type ?? '',
            currentName: meeting.name ?? '',
            currentNameEn: meeting.name_en ?? '',
            currentStatus: meeting.scheduleStatus,
            currentKind: meeting.kind ?? '',
            currentUrgent: meeting.urgent ? 'yes' : '',
            currentSessionNumber: meeting.sessionNumber?.toString() ?? '',
            currentFormat: meeting.format ?? '',
            currentPostponedTo: currentPostponedTo ?? '',
            brackets: analysis?.brackets.join(' | ') ?? '',
            storedNameLoses: nameLoses ?? '',
            proposedStatus,
            proposedPostponedTo: proposedPostponedTo ?? '',
            postponedToEvidence: proposedPostponedTo && !currentPostponedTo ? successor?.evidence ?? '' : '',
            proposedKind: proposedKind ?? '',
            kindEvidence: invitation?.kindEvidence ?? (!meeting.kind && !patch.kind && proposedKind ? `[name] ${meeting.name}` : ''),
            proposedUrgent: proposedUrgent ? 'yes' : '',
            urgentEvidence: invitation?.urgentEvidence ?? (nameUrgent ? `[name] ${meeting.name}` : ''),
            proposedSessionNumber: proposedSessionNumber?.toString() ?? '',
            sessionNumberEvidence: invitation?.sessionNumberEvidence ?? '',
            proposedFormat: proposedFormat ?? '',
            formatEvidence: invitation?.formatEvidence ?? '',
            invitationDiffers,
            idDateDiffers: meeting.id.startsWith(idDate) ? '' : `id says ${meeting.id}, held ${localDate}`,
            note: notes.join(' '),
            review,
            apply: '',
        });

        if (nameLoses) counts.nameLoses++;
        if (proposedStatus !== meeting.scheduleStatus) counts[proposedStatus === 'postponed' ? 'postponed' : 'cancelled']++;
        if (proposedPostponedTo && !currentPostponedTo) counts.linked++;
        if (!meeting.kind && proposedKind) counts.kind++;
        if (!meeting.urgent && proposedUrgent) counts.urgent++;
        if (proposedFormat !== meeting.format) counts.format++;
        if (!meeting.sessionNumber && proposedSessionNumber) counts.sessionNumber++;
        if (invitationDiffers) counts.differs++;
        if (review) counts.review++;
    }

    fs.mkdirSync(path.dirname(argv.out), { recursive: true });
    fs.writeFileSync(argv.out, [REPORT_COLUMNS.join(','), ...rows.map(toCsvLine)].join('\n') + '\n');
    console.log(`${rows.length} meetings → ${argv.out}`);
    console.log(`Names are kept as they are; ${counts.nameLoses} say something the derived name would not (storedNameLoses).`);
    console.log(`Proposals: ${counts.cancelled} cancelled, ${counts.postponed} postponed (${counts.linked} new meetings linked), ${counts.kind} kinds, ${counts.urgent} urgent, ${counts.format} formats, ${counts.sessionNumber} session numbers.`);
    console.log(`${counts.differs} invitations differ from the record; ${counts.review} rows name something to review, the others have an empty \`review\`.`);
    console.log('Review the rows, write "yes" in the apply column, then run scripts/meeting-lifecycle-apply.ts.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
