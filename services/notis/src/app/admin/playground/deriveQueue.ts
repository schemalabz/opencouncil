import { QueueItem } from "./types";

export interface MeetingSummary {
  id: string;
  cityId: string;
  name: string;
  dateTime: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Derive the playground event queue from real released meetings: each meeting
 * emits agenda_processed 3 days before and meeting_summarized 1 day after its
 * date, merged across cities in chronological order. Briefs are lazy
 * ({pending: true}) until a step actually needs them.
 */
export function deriveQueue(meetings: MeetingSummary[], from: string, to: string): QueueItem[] {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  const items: QueueItem[] = [];
  for (const m of meetings) {
    const meetingMs = new Date(m.dateTime).getTime();
    if (Number.isNaN(meetingMs)) continue;
    const meetingDate = m.dateTime.slice(0, 10);
    const shared = {
      cityId: m.cityId,
      meetingId: m.id,
      meetingName: m.name,
      meetingDate,
      brief: { pending: true as const },
    };
    const agendaAt = new Date(meetingMs - 3 * DAY_MS).toISOString();
    const summaryAt = new Date(meetingMs + 1 * DAY_MS).toISOString();
    if (new Date(agendaAt).getTime() >= fromMs && new Date(agendaAt).getTime() <= toMs) {
      items.push({
        id: `${m.cityId}:${m.id}:agenda`,
        event: { type: "agenda_processed", at: agendaAt, ...shared },
        status: "pending",
      });
    }
    if (new Date(summaryAt).getTime() >= fromMs && new Date(summaryAt).getTime() <= toMs) {
      items.push({
        id: `${m.cityId}:${m.id}:summary`,
        event: { type: "meeting_summarized", at: summaryAt, ...shared },
        status: "pending",
      });
    }
  }

  return items.sort((a, b) => new Date(a.event.at).getTime() - new Date(b.event.at).getTime());
}

/** Insert an item into a queue keeping chronological order among pending items after the cursor. */
export function insertChronological(queue: QueueItem[], item: QueueItem): QueueItem[] {
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
