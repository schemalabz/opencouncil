import { WakeRecord } from "./types";

export interface MeetingSummary {
  id: string;
  cityId: string;
  name: string;
  dateTime: string;
  administrativeBody?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Derive the playground event queue from real released meetings: one
 * meeting_summarized per meeting, 1 day after its date, merged across cities
 * in chronological order. The simulation has only a start date — it runs
 * forward through everything published since. Briefs are lazy
 * ({pending: true}) until a step actually needs them.
 *
 * No agenda_processed here, deliberately. The playground replays the archive,
 * and the archive keeps one state per meeting: the one after it happened.
 * Nothing reconstructs the record as it stood before, so an agenda wake
 * simulated from it is a post-meeting wake wearing a preview label — its
 * brief carries the real discussionSeconds and descriptions written from the
 * transcript, and every opencouncil tool the agent reaches for on that wake
 * returns votes and exchanges. The `phase: "agenda"` embargo in editorialPass
 * and the "Before vs after the meeting" section of the system prompt then
 * decide how much of that leaks, so the same setup previews one run and
 * reports the next. That is not agenda behaviour to evaluate; it is noise.
 *
 * Real agenda_processed wakes still ship — the poller fans them out from the
 * task feed, before the meeting, against a record that genuinely holds no
 * outcomes. The playground is the wrong place to judge them.
 */
export function deriveQueue(meetings: MeetingSummary[], from: string): WakeRecord[] {
  const fromMs = new Date(from).getTime();

  const items: WakeRecord[] = [];
  for (const m of meetings) {
    const meetingMs = new Date(m.dateTime).getTime();
    if (Number.isNaN(meetingMs)) continue;
    const summaryAt = new Date(meetingMs + 1 * DAY_MS).toISOString();
    if (new Date(summaryAt).getTime() < fromMs) continue;
    items.push({
      id: `${m.cityId}:${m.id}:summary`,
      event: {
        type: "meeting_summarized",
        at: summaryAt,
        cityId: m.cityId,
        meetingId: m.id,
        meetingName: m.name,
        meetingDate: m.dateTime.slice(0, 10),
        adminBody: m.administrativeBody ?? null,
        brief: { pending: true as const },
      },
      status: "pending",
    });
  }

  return items.sort((a, b) => new Date(a.event.at).getTime() - new Date(b.event.at).getTime());
}

/** Insert an item into a queue keeping chronological order among pending items after the cursor. */
export function insertChronological(queue: WakeRecord[], item: WakeRecord): WakeRecord[] {
  const next = [...queue];
  const at = new Date(item.event.at).getTime();
  let idx = next.length;
  for (let i = 0; i < next.length; i++) {
    if (next[i].status === "pending" && new Date(next[i].event.at).getTime() > at) {
      idx = i;
      break;
    }
  }
  next.splice(idx, 0, item);
  return next;
}
