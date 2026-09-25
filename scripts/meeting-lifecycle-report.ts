/**
 * Read-only report for the reviewed backfill of the meeting record (#150).
 *
 * The stored names of the archive carry facts that now have their own
 * columns: «[Ακυρώθηκε]» is a status, «Λογοδοσίας» is a kind, and most names
 * say only the body and the date, which the derived name says anyway. This
 * script proposes a value for each column and writes a CSV. A person reviews
 * each row and writes `yes` in the `apply` column; then
 * scripts/meeting-lifecycle-apply.ts writes the accepted rows.
 *
 *   npx tsx scripts/meeting-lifecycle-report.ts --out reports/meeting-lifecycle.csv
 *   npx tsx scripts/meeting-lifecycle-report.ts --city athens --agendas --pdf-cache /tmp/agendas
 *
 * With --agendas, the script downloads each agenda PDF and reads its first
 * pages for the format and, in the four cities whose invitation prints it
 * reliably, the session number. The script writes nothing to the database.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import pdf from 'pdf-parse';
import { createHash } from 'crypto';
import prisma from '@/lib/db/prisma';
import { formatDateAsMeetingId } from '@/lib/utils/meetingId';
import { localCalendarDate } from '@/lib/formatters/time';
import { DEFAULT_AGENDA_HOSTS, analyzeStoredName, isAllowedAgendaUrl, proposeFormat, proposeSessionNumber } from '@/lib/meetingRecordBackfill';
import { REPORT_COLUMNS, assertNotProduction, toCsvLine, type ReportRow } from './lib/meetingLifecycleCsv';

async function agendaText(url: string, cacheDir: string | undefined): Promise<string | null> {
    const key = createHash('sha256').update(url).digest('hex');
    const file = cacheDir ? path.join(cacheDir, `${key}.pdf`) : null;
    let buffer: Buffer;
    if (file && fs.existsSync(file)) {
        buffer = fs.readFileSync(file);
    } else {
        const response = await fetch(url, { redirect: 'error' });
        if (!response.ok) return null;
        buffer = Buffer.from(await response.arrayBuffer());
        if (file) fs.writeFileSync(file, buffer);
    }
    const parsed = await pdf(buffer, { max: 2 });
    return parsed.text;
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('out', { type: 'string', default: 'reports/meeting-lifecycle.csv', describe: 'Where to write the CSV' })
        .option('city', { type: 'string', describe: 'Only the meetings of this city id' })
        .option('agendas', { type: 'boolean', default: false, describe: 'Read the agenda PDFs for the format and the session number' })
        .option('pdf-cache', { type: 'string', describe: 'A folder that keeps the downloaded PDFs between runs' })
        .option('agenda-host', { type: 'string', array: true, default: [] as string[], describe: 'Another host that agenda PDFs may come from' })
        .option('i-know-this-is-production', { type: 'boolean', default: false })
        .strict()
        .parse();
    assertNotProduction(argv['i-know-this-is-production']);
    if (argv['pdf-cache']) fs.mkdirSync(argv['pdf-cache'], { recursive: true });

    const meetings = await prisma.councilMeeting.findMany({
        where: argv.city ? { cityId: argv.city } : {},
        select: {
            id: true, cityId: true, name: true, name_en: true, dateTime: true, agendaUrl: true,
            scheduleStatus: true, kind: true, sessionNumber: true, format: true,
            administrativeBody: { select: { name: true, type: true } },
            city: { select: { timezone: true } },
        },
        orderBy: [{ cityId: 'asc' }, { dateTime: 'asc' }],
    });

    const agendaHosts = [...DEFAULT_AGENDA_HOSTS, ...argv['agenda-host']];
    const rows: ReportRow[] = [];
    const counts = { derivable: 0, keep: 0, cancelled: 0, kind: 0, format: 0, sessionNumber: 0 };
    for (const meeting of meetings) {
        const localDate = localCalendarDate(meeting.dateTime, meeting.city.timezone);
        const analysis = meeting.name ? analyzeStoredName(meeting.name, { bodyName: meeting.administrativeBody?.name ?? null }) : null;
        let format: ReturnType<typeof proposeFormat> = null;
        let sessionNumber: ReturnType<typeof proposeSessionNumber> = null;
        if (argv.agendas && meeting.agendaUrl?.toLowerCase().endsWith('.pdf') && !isAllowedAgendaUrl(meeting.agendaUrl, agendaHosts)) {
            console.error(`${meeting.cityId}/${meeting.id}: agenda not read: host not allowed (${meeting.agendaUrl})`);
        } else if (argv.agendas && meeting.agendaUrl?.toLowerCase().endsWith('.pdf')) {
            try {
                const text = await agendaText(meeting.agendaUrl, argv['pdf-cache']);
                if (text) {
                    format = proposeFormat(text);
                    sessionNumber = proposeSessionNumber(meeting.cityId, text);
                }
            } catch (error) {
                console.error(`${meeting.cityId}/${meeting.id}: agenda not read:`, (error as Error).message);
            }
        }

        const idDate = formatDateAsMeetingId(new Date(`${localDate}T12:00:00Z`));
        const notes = [
            analysis?.note,
            analysis?.combined ? 'combined' : null,
            analysis?.interrupted ? 'interrupted' : null,
            analysis?.ordinal ? `ordinal:${analysis.ordinal}` : null,
        ].filter(Boolean).join(' ');
        // A derivable name is cleared; the English one goes with it, because
        // the archive's English names are transliterations of the Greek.
        const keep = analysis && !analysis.derivable;
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
            currentSessionNumber: meeting.sessionNumber?.toString() ?? '',
            currentFormat: meeting.format,
            brackets: analysis?.brackets.join(' | ') ?? '',
            proposedName: keep ? analysis.cleanedName : '',
            proposedNameEn: keep ? (meeting.name_en ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() : '',
            proposedStatus: analysis?.proposedStatus ?? meeting.scheduleStatus,
            proposedKind: meeting.kind ?? analysis?.proposedKind ?? '',
            proposedSessionNumber: meeting.sessionNumber?.toString() ?? sessionNumber?.number.toString() ?? '',
            sessionNumberEvidence: sessionNumber?.evidence ?? '',
            // A meeting by circulation is a follow-up of #150: the report
            // shows the evidence and proposes no change.
            proposedFormat: format && format.format !== 'byCirculation' ? format.format : meeting.format,
            formatEvidence: format ? `${format.format === 'byCirculation' ? '[by circulation, not proposed] ' : ''}${format.evidence}` : '',
            idDateDiffers: meeting.id.startsWith(idDate) ? '' : `id says ${meeting.id}, held ${localDate}`,
            note: notes,
            apply: '',
        });

        if (analysis?.derivable) counts.derivable++; else if (analysis) counts.keep++;
        if (analysis?.proposedStatus) counts.cancelled++;
        if (!meeting.kind && analysis?.proposedKind) counts.kind++;
        if (format && format.format !== 'byCirculation' && format.format !== meeting.format) counts.format++;
        if (!meeting.sessionNumber && sessionNumber) counts.sessionNumber++;
    }

    fs.mkdirSync(path.dirname(argv.out), { recursive: true });
    fs.writeFileSync(argv.out, [REPORT_COLUMNS.join(','), ...rows.map(toCsvLine)].join('\n') + '\n');
    console.log(`${rows.length} meetings → ${argv.out}`);
    console.log(`Names: ${counts.derivable} derivable, ${counts.keep} kept as an override (without brackets).`);
    console.log(`Proposals: ${counts.cancelled} cancelled, ${counts.kind} kinds, ${counts.format} formats, ${counts.sessionNumber} session numbers.`);
    console.log('Review the rows, write "yes" in the apply column, then run scripts/meeting-lifecycle-apply.ts.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
