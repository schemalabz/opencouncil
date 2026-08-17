import { z } from "zod";

/**
 * Canonical wire schemas for the agent's data shapes. The TypeScript types in
 * ./types derive from these via z.infer, and the API routes validate with
 * them — change a field here and the type, the validation and every consumer
 * follow. (The editorial pass keeps its own hand-built JSON schema for model
 * structured output: it embeds a per-meeting subjectId enum that a static
 * schema cannot express.)
 */

export const WAKE_EVENT_TYPES = [
  "agenda_processed",
  "meeting_summarized",
  "user_message",
  "scheduled",
  "heartbeat",
] as const;

export const journalEntrySchema = z.object({
  /** ISO timestamp of the wake's event (the world's timeline, not the wall clock). */
  at: z.string(),
  /** The wake trigger — or "enrollment" for the system-sent intro/transition
   *  template, "system" for shell-side bookkeeping (e.g. a phone-gone
   *  unsubscribe by the poller). */
  event: z.enum([...WAKE_EVENT_TYPES, "enrollment", "system"]),
  decision: z.enum(["silence", "send"]),
  rationale: z.string(),
  /** Texts sent (empty on silence). */
  messages: z.array(z.string()),
  /** What the user wrote, verbatim, on user_message wakes — the journal IS the conversation memory. */
  received: z.string().optional(),
  /** The wake rewrote the taste profile — future wakes must see their own memory changed. */
  profileRewritten: z.boolean().optional(),
  /** The wake unsubscribed the reader. */
  unsubscribed: z.boolean().optional(),
  /** The wake was cut at the token ceiling — this entry is not a decision. */
  truncated: z.boolean().optional(),
});

/**
 * A pinned place. The bare-string form is the PR 1 shape (free text only) and
 * stays valid so recorded fixtures and stored playground states replay
 * unchanged; new producers (the fanout view, the wizard) emit the object form
 * with coordinates so wake assembly can compute subject distances.
 */
export const preferenceLocationSchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    lng: z.number().optional(),
    lat: z.number().optional(),
  }),
]);

export const cityPreferenceSchema = z.object({
  cityId: z.string(),
  cityName: z.string(),
  /** Greek topic labels, as MCP search accepts them. */
  topics: z.array(z.string()),
  /** Pinned streets/neighbourhoods. */
  locations: z.array(preferenceLocationSchema),
});

export const wakeStateSchema = z.object({
  user: z.object({
    name: z.string(),
    cities: z.array(cityPreferenceSchema),
  }),
  /** Free-text taste profile. Model-owned: rewritten wholesale via update_taste_profile. */
  profile: z.string(),
  /** Append-only, oldest first. The prompt receives the most recent JOURNAL_WINDOW entries. */
  journal: z.array(journalEntrySchema),
});

export const editorialSubjectSchema = z.object({
  subjectId: z.string(),
  name: z.string(),
  topicLabels: z.array(z.string()),
  discussionSeconds: z.number(),
  /** Each dimension scored 0–5 by the editorial pass. */
  scores: z.object({
    hyperlocal: z.number(),
    citywide: z.number(),
    contention: z.number(),
    novelty: z.number(),
    money: z.number(),
  }),
  /** One Greek line: why this score profile. */
  note: z.string(),
  /** Streets/squares/neighbourhoods named in the record. */
  locationHints: z.array(z.string()),
  /**
   * The subject's mapped location (geometry centroid), copied mechanically
   * from the MCP record — never model-written. Wake assembly uses it to
   * compute distances to the reader's pinned places.
   */
  location: z
    .object({
      text: z.string().nullish(),
      lng: z.number(),
      lat: z.number(),
    })
    .nullish(),
  /** The subject's opencouncil.gr page — carried so no-research sends never build links by hand. */
  url: z.string().optional(),
});

export const editorialBriefSchema = z.object({
  cityId: z.string(),
  meetingId: z.string(),
  generatedAt: z.string(),
  /** 1-2 Greek sentences: what mattered in this meeting. */
  headline: z.string(),
  /** The meeting's opencouncil.gr page. */
  meetingUrl: z.string().optional(),
  subjects: z.array(editorialSubjectSchema),
});

const meetingEventFields = {
  at: z.string(),
  cityId: z.string(),
  meetingId: z.string(),
  meetingName: z.string(),
  meetingDate: z.string(),
  /** Which body is meeting (Δημοτικό Συμβούλιο, Επιτροπή, Κοινότητα...). */
  adminBody: z.string().nullable().optional(),
  brief: editorialBriefSchema,
};

export const wakeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agenda_processed"), ...meetingEventFields }),
  z.object({ type: z.literal("meeting_summarized"), ...meetingEventFields }),
  z.object({ type: z.literal("user_message"), at: z.string(), text: z.string() }),
  z.object({
    type: z.literal("scheduled"),
    at: z.string(),
    reason: z.string(),
    /** Why the schedule existed: a promised answer to a reader question
     *  ("reply") or a self-scheduled follow-up to proactive news
     *  ("proactive"). Absent in pre-PR-4 records — treated as "reply",
     *  which matches their history (the live lane was the only producer). */
    origin: z.enum(["reply", "proactive"]).optional(),
  }),
  z.object({ type: z.literal("heartbeat"), at: z.string() }),
]);

/**
 * Which of a coalesced wake's events leads: the meatiest content wins the
 * template shell and the journal label, and user_message dominating keeps
 * every reactive invariant (freeform delivery, repair nudges) intact.
 */
export const EVENT_PRIORITY = [
  "user_message",
  "meeting_summarized",
  "agenda_processed",
  "scheduled",
  "heartbeat",
] as const;

export function primaryEvent<T extends { type: string }>(events: readonly T[]): T {
  if (events.length === 0) throw new Error("primaryEvent: empty events");
  let best = events[0];
  for (const event of events) {
    if (EVENT_PRIORITY.indexOf(event.type as (typeof EVENT_PRIORITY)[number])
      < EVENT_PRIORITY.indexOf(best.type as (typeof EVENT_PRIORITY)[number])) {
      best = event;
    }
  }
  return best;
}

export const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
