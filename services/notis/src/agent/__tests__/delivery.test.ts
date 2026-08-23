import { decideDelivery } from "../delivery";
import { SERVICE_WINDOW_MS } from "../templates";
import { WakeEvent } from "../types";
import { meetingEvent } from "./helpers";

const NOW = new Date("2026-03-10T10:00:00Z");
const AT = NOW.toISOString();

const userMessage: WakeEvent = { type: "user_message", at: AT, text: "γεια" };
const summarized: WakeEvent = meetingEvent();
const agenda: WakeEvent = { ...meetingEvent(), type: "agenda_processed" } as WakeEvent;
const scheduledReply: WakeEvent = { type: "scheduled", at: AT, reason: "r", origin: "reply" };
const scheduledProactive: WakeEvent = {
  type: "scheduled",
  at: AT,
  reason: "r",
  origin: "proactive",
};
const scheduledLegacy: WakeEvent = { type: "scheduled", at: AT, reason: "r" };

describe("decideDelivery", () => {
  it("a user_message reply is always free-form — it answers the message that opened the window", () => {
    expect(decideDelivery(userMessage, undefined, NOW)).toEqual({ mode: "freeform" });
  });

  it("proactive sends go free-form only inside the 24h window", () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(decideDelivery(summarized, twoHoursAgo, NOW)).toEqual({ mode: "freeform" });
  });

  it("outside the window every event type rides its template shell", () => {
    const closed = new Date(NOW.getTime() - SERVICE_WINDOW_MS - 1000).toISOString();
    expect(decideDelivery(agenda, closed, NOW)).toEqual({
      mode: "template",
      template: "demos_update_agenda",
    });
    expect(decideDelivery(summarized, closed, NOW)).toEqual({
      mode: "template",
      template: "demos_update_news",
    });
    expect(decideDelivery(scheduledReply, closed, NOW)).toEqual({
      mode: "template",
      template: "demos_followup",
    });
  });

  it("a scheduled wake's shell follows the schedule's origin", () => {
    // A follow-up to proactive news must not pretend to answer a question.
    expect(decideDelivery(scheduledProactive, undefined, NOW)).toEqual({
      mode: "template",
      template: "demos_update_news",
    });
    // Pre-PR-4 records carry no origin; every one came from a reply wake.
    expect(decideDelivery(scheduledLegacy, undefined, NOW)).toEqual({
      mode: "template",
      template: "demos_followup",
    });
  });

  it("no prior user message means the window is closed", () => {
    expect(decideDelivery(summarized, undefined, NOW)).toEqual({
      mode: "template",
      template: "demos_update_news",
    });
  });
});
