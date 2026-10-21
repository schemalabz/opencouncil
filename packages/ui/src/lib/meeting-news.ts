/**
 * When a meeting is news to its subscribers. Notis decides by this rule for
 * WhatsApp (services/notis/src/lib/poller.ts), and the app for email
 * (src/lib/notifications/freshness.ts), so a release, a re-run or a late task
 * reaches both channels or neither.
 */

/** How far back the event feed looks. completedAt moves on task-row
 *  rewrites, so this is a coarse window — dedup is by meeting and phase. */
export const EVENT_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

/**
 * A meeting older than this is never news, whatever its task rows say.
 * completedAt is TaskStatus.updatedAt underneath: a re-run (batchRerun
 * --force writes NEW succeeded rows) or any client-side touch of old rows
 * re-enters them into the lookback, and the meeting-identity dedup only
 * protects meetings notis has already recorded — pre-launch history is not.
 * Without this guard one maintenance script would pay an editorial pass per
 * old meeting and WhatsApp whole cohorts about years-old news.
 */
export const STALE_MEETING_MS = 15 * 24 * 60 * 60_000;

/** The tasks whose success is news: the agenda before the meeting, the summary after it. */
export type MeetingNewsPhase = 'processAgenda' | 'summarize';

/**
 * What to do with one meeting event, decided by its type and the MEETING's
 * own date — never by when the task finished. The table:
 *
 * | event          | meeting ahead | meeting past      |
 * |----------------|---------------|-------------------|
 * | processAgenda  | fanout        | late-agenda       |
 * | summarize      | future-summary| fanout            |
 *
 * `stale` overrides both for a meeting older than STALE_MEETING_MS. That is
 * a blast-radius floor, not part of the semantics above: completedAt is
 * TaskStatus.updatedAt, so one `batchRerun --force` over the archive would
 * otherwise pay an editorial pass per meeting and WhatsApp whole cohorts
 * about years-old news. Dedup does not cover it — a meeting notis never
 * recorded (pre-launch history) has no processed row to match.
 *
 * - `late-agenda`: a processAgenda task that succeeded after the meeting was
 *   held (a late upload, a backfill, batchRerun --force). Fanning it out
 *   would preview a meeting that already happened, against an archive that
 *   by then carries the transcript. The summarize event is that meeting's
 *   real news and arrives on its own.
 * - `future-summary`: a meeting cannot be summarized before it happens, so
 *   this is a data error — almost always a wrong CouncilMeeting.dateTime.
 *   The Notis poller alarms and sends nothing. Unlike the other two it is NOT
 *   consumed, so correcting the date lets the same event fan out — but only
 *   while the task row is still inside EVENT_LOOKBACK_MS. completedAt is
 *   TaskStatus.updatedAt and does not move when CouncilMeeting.dateTime is
 *   fixed, so a later fix needs the summarize task re-run. The alarm says so.
 */
export type EventDisposition = 'fanout' | 'stale' | 'late-agenda' | 'future-summary';

export function classifyEvent(
    row: { type: string; meetingDate: Date },
    at: Date,
    staleBefore: Date,
): EventDisposition {
    if (row.meetingDate < staleBefore) return 'stale';
    const ahead = row.meetingDate > at;
    if (row.type === 'processAgenda') return ahead ? 'fanout' : 'late-agenda';
    return ahead ? 'future-summary' : 'fanout';
}
