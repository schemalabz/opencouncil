import {
  EditorialBrief,
  JOURNAL_WINDOW,
  Prompts,
  WakeEvent,
  WakeState,
} from "./types";

/**
 * Prompt assembly. Ordering is stable→volatile for prefix caching: tools and
 * both system blocks are byte-identical across users and wakes (enforced by a
 * unit test), so the single cache breakpoint on the last system block caches
 * the whole prefix. Everything per-user/per-event lives in the user turn.
 */

export function assembleSystem(
  prompts: Prompts,
): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral"; ttl?: "5m" | "1h" } }> {
  return [
    { type: "text", text: prompts.system },
    { type: "text", text: prompts.contextPack, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];
}

function renderBrief(brief: EditorialBrief): string {
  const lines = brief.subjects.map((s) => {
    const sc = s.scores;
    return [
      `- ${s.name} [subject:${s.subjectId}]`,
      `  topics: ${s.topicLabels.join(", ") || "—"} · discussion: ${Math.round(s.discussionSeconds / 60)}min`,
      `  scores: hyperlocal ${sc.hyperlocal}/5, citywide ${sc.citywide}/5, contention ${sc.contention}/5, novelty ${sc.novelty}/5, money ${sc.money}/5`,
      s.locationHints.length ? `  locations: ${s.locationHints.join("; ")}` : null,
      `  note: ${s.note}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `${brief.headline}\n\n${lines.join("\n")}`;
}

export function renderEvent(event: WakeEvent): string {
  switch (event.type) {
    case "agenda_processed":
      return (
        `The agenda for an upcoming meeting has been processed.\n` +
        `Meeting: ${event.meetingName} (${event.meetingDate})${
          event.adminBody ? ` — ${event.adminBody}` : ""
        }, city ${event.cityId}, id ${event.meetingId}.\n` +
        `Editorial brief (a map, not a source — read the record before quoting):\n${renderBrief(event.brief)}`
      );
    case "meeting_summarized":
      return (
        `A meeting has concluded and its record is published.\n` +
        `Meeting: ${event.meetingName} (${event.meetingDate})${
          event.adminBody ? ` — ${event.adminBody}` : ""
        }, city ${event.cityId}, id ${event.meetingId}.\n` +
        `Editorial brief (a map, not a source — read the record before quoting):\n${renderBrief(event.brief)}`
      );
    case "user_message":
      return `The reader wrote to you on WhatsApp:\n«${event.text}»`;
    case "scheduled":
      return `You scheduled this wake for yourself. Your note:\n«${event.reason}»`;
    case "heartbeat":
      return `Routine daily check-in. Nothing specific happened.`;
  }
}

export function assembleUserTurn(state: WakeState, event: WakeEvent, now: Date): string {
  const cities = state.user.cities
    .map(
      (c) =>
        `- ${c.cityName} (${c.cityId}): topics [${c.topics.join(", ") || "—"}], places [${c.locations.join("; ") || "—"}]`,
    )
    .join("\n");

  const journal = state.journal
    .slice(-JOURNAL_WINDOW)
    .map(
      (j) =>
        `[${j.at}] ${j.event} → ${j.decision}${
          j.received ? `\n  they wrote: «${j.received}»` : ""
        }${
          j.messages.length ? `\n  sent: ${j.messages.map((m) => `«${m}»`).join(" | ")}` : ""
        }\n  why: ${j.rationale}`,
    )
    .join("\n");

  return [
    `<user_profile>`,
    `Name: ${state.user.name}`,
    `Cities and notification preferences:`,
    cities || "- (none)",
    `</user_profile>`,
    ``,
    `<taste_profile>`,
    state.profile || "(empty — you have not learned anything about them yet)",
    `</taste_profile>`,
    ``,
    `<journal>`,
    journal || "(empty — you have never written to or heard from this person)",
    `</journal>`,
    ``,
    `<current_time>${now.toISOString()}</current_time>`,
    ``,
    `<event>`,
    renderEvent(event),
    `</event>`,
  ].join("\n");
}
