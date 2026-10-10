import { asMeetingKind, meetingTitle } from "@opencouncil/ui/lib/meeting-title";
import { fmtNumericDate } from "./format";

/** The facts that a meeting event or a ledger row carries. */
export interface MeetingLabelFacts {
  adminBody?: string | null;
  /** The name override; on a record from before the facts, the stored name. */
  meetingName?: string | null;
  meetingKind?: string | null;
  sessionNumber?: number | null;
  meetingDate?: string | null;
}

/**
 * «Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026», with the title from the
 * shared rule the app uses: an override takes the place of the title. A
 * record from before the facts has only the stored name, which stands in
 * the same place. The date is printed once, also when the title carries it
 * («Συνεδρίαση 12/03/2026»).
 */
export function meetingLabel(facts: MeetingLabelFacts, { date = true }: { date?: boolean } = {}): string {
  const day = facts.meetingDate ? fmtNumericDate(facts.meetingDate) : null;
  const title = meetingTitle(
    { override: facts.meetingName, kind: asMeetingKind(facts.meetingKind), sessionNumber: facts.sessionNumber },
    "el",
    () => day ?? "",
  );
  return [facts.adminBody, title.text, date && !title.dated ? day : null].filter(Boolean).join(" · ");
}
