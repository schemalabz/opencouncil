import { asMeetingKind, meetingTitle } from "@opencouncil/ui/lib/meeting-title";
import { fmtNumericDate } from "./format";

/** The facts that a meeting event or a ledger row carries. */
export interface MeetingLabelFacts {
  adminBody?: string | null;
  /** The legacy stored name. A meeting without a kind falls back to it. */
  meetingName?: string | null;
  meetingKind?: string | null;
  urgent?: boolean | null;
  sessionNumber?: number | null;
  meetingDate?: string | null;
}

/**
 * «Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026», by the shared rule the app
 * uses. A meeting without a kind falls back to its legacy stored name, which
 * is the whole label; a record from before the facts has only that name. The
 * date is printed once, also when the title carries it
 * («Συνεδρίαση 12/03/2026»).
 */
export function meetingLabel(facts: MeetingLabelFacts, { date = true }: { date?: boolean } = {}): string {
  const day = facts.meetingDate ? fmtNumericDate(facts.meetingDate) : null;
  const title = meetingTitle(
    {
      storedName: facts.meetingName,
      kind: asMeetingKind(facts.meetingKind),
      sessionNumber: facts.sessionNumber,
      urgent: facts.urgent ?? false,
    },
    "el",
    () => day ?? "",
  );
  if (title.wholeLabel) return title.text;
  return [facts.adminBody, title.text, date && !title.dated ? day : null].filter(Boolean).join(" · ");
}
