import { TemplateName, isWindowOpen, templateForEvent } from "./templates";
import { WakeEvent } from "./types";

/**
 * WhatsApp delivery rails: inside the 24h customer-service window (opened by
 * the reader's last message) sends go free-form; outside it every message
 * must ride an approved template shell. One implementation, shared by the
 * playground simulator and the real send path — the two must never disagree.
 */

export type Delivery = { mode: "freeform" } | { mode: "template"; template: TemplateName };

export function decideDelivery(
  eventType: WakeEvent["type"],
  lastUserMessageAt: string | undefined,
  at: Date,
): Delivery {
  // A user_message wake replies to the message that opened the window —
  // definitionally inside it.
  if (eventType === "user_message" || isWindowOpen(lastUserMessageAt, at)) {
    return { mode: "freeform" };
  }
  return { mode: "template", template: templateForEvent(eventType) };
}
