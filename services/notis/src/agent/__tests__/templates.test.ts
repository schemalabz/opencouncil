import {
  TEMPLATES,
  isWindowOpen,
  renderTemplate,
  templateForEvent,
} from "../templates";

describe("templates", () => {
  it("renders variable templates with the fixed shell around the agent text", () => {
    const r = renderTemplate("demos_update_news", "Πέρασε η ανάπλαση.");
    expect(r.body).toBe("Νέα από τον δήμο σου:\n\nΠέρασε η ανάπλαση.\n\nΠερισσότερα στο link.");
    expect(r.footer).toBe("Απάντησε ΣΤΟΠ για να μη λαμβάνεις μηνύματα.");
    expect(r.buttons.map((b) => b.label)).toEqual(["Δες περισσότερα", "Πες μου περισσότερα"]);
  });

  it("fixed templates ignore agent text and keep their approved body verbatim", () => {
    const r = renderTemplate("demos_transition", "should be ignored");
    expect(r.body).toContain("Οι ειδοποιήσεις του OpenCouncil αλλάζουν!");
    expect(r.body).not.toContain("ignored");
    expect(r.footer).toBe("Απάντησε ΣΤΟΠ για να λαμβάνεις μόνο email.");
  });

  it("maps wake events to the right shell", () => {
    expect(templateForEvent("agenda_processed")).toBe("demos_update_agenda");
    expect(templateForEvent("meeting_summarized")).toBe("demos_update_news");
    expect(templateForEvent("scheduled")).toBe("demos_followup");
    expect(templateForEvent("heartbeat")).toBe("demos_update_news");
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
});
