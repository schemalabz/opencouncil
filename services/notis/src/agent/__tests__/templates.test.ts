import { WakeEvent } from "../types";
import {
  TEMPLATES,
  type TemplateName,
  isWindowOpen,
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
