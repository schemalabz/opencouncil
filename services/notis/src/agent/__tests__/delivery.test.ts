import { decideDelivery } from "../delivery";
import { SERVICE_WINDOW_MS } from "../templates";

const NOW = new Date("2026-03-10T10:00:00Z");

describe("decideDelivery", () => {
  it("a user_message reply is always free-form — it answers the message that opened the window", () => {
    expect(decideDelivery("user_message", undefined, NOW)).toEqual({ mode: "freeform" });
  });

  it("proactive sends go free-form only inside the 24h window", () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(decideDelivery("meeting_summarized", twoHoursAgo, NOW)).toEqual({ mode: "freeform" });
  });

  it("outside the window every event type rides its template shell", () => {
    const closed = new Date(NOW.getTime() - SERVICE_WINDOW_MS - 1000).toISOString();
    expect(decideDelivery("agenda_processed", closed, NOW)).toEqual({
      mode: "template",
      template: "demos_update_agenda",
    });
    expect(decideDelivery("meeting_summarized", closed, NOW)).toEqual({
      mode: "template",
      template: "demos_update_news",
    });
    expect(decideDelivery("scheduled", closed, NOW)).toEqual({
      mode: "template",
      template: "demos_followup",
    });
  });

  it("no prior user message means the window is closed", () => {
    expect(decideDelivery("meeting_summarized", undefined, NOW)).toEqual({
      mode: "template",
      template: "demos_update_news",
    });
  });
});
