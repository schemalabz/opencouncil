import { WakeEvent } from "../types";

const BRIEF = {
  cityId: "athens",
  meetingId: "m",
  generatedAt: "2026-07-29T18:00:00.000Z",
  headline: "h",
  subjects: [],
};
import {
  TEMPLATES,
  type TemplateName,
  isWindowOpen,
  linkPathForEvent,
  linkPathFromText,
  renderTemplate,
  templateForEvent,
} from "../templates";

// templateForEvent reads only type (and origin for scheduled); the stub
// skips the meeting payloads.
function ev(type: string): WakeEvent {
  return { type, at: "2026-03-10T10:00:00Z" } as unknown as WakeEvent;
}

describe("templates", () => {
  it("renders variable templates with the fixed shell around the agent text", () => {
    const r = renderTemplate("demos_update_news", "Πέρασε η ανάπλαση.");
    expect(r.body).toBe("Νέα από τον δήμο σου:\n\nΠέρασε η ανάπλαση.\n\nΠερισσότερα στο link.");
    expect(r.footer).toBe("Μήνυμα με τεχνητή νοημοσύνη. ΣΤΟΠ για διακοπή.");
    expect(r.buttons.map((b) => b.label)).toEqual(["Δες περισσότερα", "Πες μου περισσότερα"]);
  });

  it("fixed templates ignore agent text and keep their approved body verbatim", () => {
    const r = renderTemplate("demos_transition", "should be ignored");
    expect(r.body).toContain("Οι ειδοποιήσεις του OpenCouncil αλλάζουν!");
    expect(r.body).not.toContain("ignored");
    expect(r.footer).toBe("Μήνυμα με τεχνητή νοημοσύνη. ΣΤΟΠ για μόνο email.");
  });

  it("maps wake events to the right shell", () => {
    expect(templateForEvent(ev("agenda_processed"))).toBe("demos_update_agenda");
    expect(templateForEvent(ev("meeting_summarized"))).toBe("demos_update_news");
    expect(templateForEvent(ev("heartbeat"))).toBe("demos_update_news");
  });

  it("a scheduled wake's shell follows the schedule's origin — absent means reply", () => {
    expect(templateForEvent({ type: "scheduled", at: "2026-03-10T10:00:00Z", reason: "r" }))
      .toBe("demos_followup");
    expect(
      templateForEvent({
        type: "scheduled", at: "2026-03-10T10:00:00Z", reason: "r", origin: "reply",
      }),
    ).toBe("demos_followup");
    expect(
      templateForEvent({
        type: "scheduled", at: "2026-03-10T10:00:00Z", reason: "r", origin: "proactive",
      }),
    ).toBe("demos_update_news");
  });

  it("24h window: open only within a day of the last user message", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    expect(isWindowOpen(undefined, now)).toBe(false);
    expect(isWindowOpen("2026-07-15T00:00:00.000Z", now)).toBe(true);
    expect(isWindowOpen("2026-07-14T11:59:00.000Z", now)).toBe(false);
    expect(isWindowOpen("2026-07-14T12:01:00.000Z", now)).toBe(true);
  });

  it("every template carries a ΣΤΟΠ footer and a quick reply", () => {
    for (const def of Object.values(TEMPLATES)) {
      expect(def.footer).toContain("ΣΤΟΠ");
      expect(def.buttons.some((b) => b.kind === "quick_reply")).toBe(true);
    }
  });

  it("every footer discloses the AI and fits WhatsApp's 60-character cap", () => {
    // Both are contractual: the AI Act wants the disclosure on anything an
    // agent wrote, and Meta rejects a template whose footer runs long.
    for (const name of Object.keys(TEMPLATES) as TemplateName[]) {
      const { footer } = renderTemplate(name, "κείμενο");
      expect(footer).toContain("τεχνητή νοημοσύνη");
      expect(footer).toContain("ΣΤΟΠ");
      expect(footer.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("link_path", () => {
  it("every shell with a URL button that Bird made dynamic declares hasLinkPath", () => {
    // Verified against the Bird console 2026-08-24: the three shells carrying
    // {{demos_text}} also carry {{link_path}}; intro, transition and checkin
    // declare no variables at all. A shell that needs one and does not send it
    // is a terminal 422 — the reader never gets the message.
    expect(TEMPLATES.demos_update_agenda.hasLinkPath).toBe(true);
    expect(TEMPLATES.demos_update_news.hasLinkPath).toBe(true);
    expect(TEMPLATES.demos_followup.hasLinkPath).toBe(true);
    expect(TEMPLATES.demos_intro.hasLinkPath).toBe(false);
    expect(TEMPLATES.demos_transition.hasLinkPath).toBe(false);
    expect(TEMPLATES.demos_checkin.hasLinkPath).toBe(false);
  });

  it("a shell that carries the text variable also carries the link", () => {
    // Bird's own shapes: the shells that talk about a specific meeting are
    // exactly the ones with a dynamic button. If this ever diverges, the
    // divergence is in Bird and this file must be re-checked against it.
    for (const def of Object.values(TEMPLATES)) {
      expect(def.hasLinkPath).toBe(def.hasVariable);
    }
  });

  it("takes the path from the link the agent wrote", () => {
    expect(linkPathFromText("Δες το θέμα: https://opencouncil.gr/athens/jul29_2_2026")).toBe(
      "athens/jul29_2_2026",
    );
    expect(
      linkPathFromText("…στο https://opencouncil.gr/athens/jul29_2_2026/subjects/abc123 ."),
    ).toBe("athens/jul29_2_2026/subjects/abc123");
  });

  it("drops trailing prose punctuation, and Greek quotes", () => {
    expect(linkPathFromText("εδώ: https://opencouncil.gr/athens/aug18_2026.")).toBe(
      "athens/aug18_2026",
    );
    expect(linkPathFromText("«https://opencouncil.gr/athens/aug18_2026»")).toBe("athens/aug18_2026");
    expect(linkPathFromText("(https://www.opencouncil.gr/athens/aug18_2026)")).toBe(
      "athens/aug18_2026",
    );
  });

  it("returns nothing when the body carries no link", () => {
    expect(linkPathFromText("Καμία σύνδεση εδώ.")).toBeUndefined();
    expect(linkPathFromText("https://example.com/athens/x")).toBeUndefined();
    // The bare domain has no path to send.
    expect(linkPathFromText("https://opencouncil.gr/")).toBeUndefined();
  });
});

describe("linkPathForEvent", () => {
  it("names the meeting for the two shells built around one", () => {
    expect(
      linkPathForEvent({
        type: "meeting_summarized",
        at: "2026-07-29T18:00:00.000Z",
        cityId: "athens",
        meetingId: "jul29_2_2026",
        meetingName: "x",
        meetingDate: "2026-07-29T12:00:00.000Z",
        brief: BRIEF,
      }),
    ).toBe("athens/jul29_2_2026");
    expect(
      linkPathForEvent({
        type: "agenda_processed",
        at: "2026-07-14T18:00:00.000Z",
        cityId: "chania",
        meetingId: "jul15_2026",
        meetingName: "x",
        meetingDate: "2026-07-15T12:00:00.000Z",
        brief: BRIEF,
      }),
    ).toBe("chania/jul15_2026");
  });

  it("has nothing to name for a scheduled follow-up", () => {
    // Which is why the body link stays as the second source: this is the one
    // template send with no meeting on its event.
    expect(
      linkPathForEvent({ type: "scheduled", at: "2026-07-29T18:00:00.000Z", reason: "r" }),
    ).toBeUndefined();
    expect(linkPathForEvent({ type: "heartbeat", at: "2026-07-29T18:00:00.000Z" })).toBeUndefined();
  });
});

describe("link path hardening", () => {
  it("drops a query string or fragment", () => {
    // Bird substitutes this into an approved base URL that expects a path.
    expect(linkPathFromText("https://opencouncil.gr/athens/aug18_2026?utm=wa")).toBe(
      "athens/aug18_2026",
    );
    expect(linkPathFromText("https://opencouncil.gr/athens/aug18_2026#top")).toBe(
      "athens/aug18_2026",
    );
  });

  it("encodes identifiers that would break the URL", () => {
    expect(
      linkPathForEvent({
        type: "meeting_summarized",
        at: "2026-07-29T18:00:00.000Z",
        cityId: "a city",
        meetingId: "jul/29",
        meetingName: "x",
        meetingDate: "2026-07-29T12:00:00.000Z",
        brief: BRIEF,
      }),
    ).toBe("a%20city/jul%2F29");
  });
});
