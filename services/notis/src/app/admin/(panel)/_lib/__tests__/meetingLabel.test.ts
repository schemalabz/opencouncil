import { meetingLabel } from "../meetingLabel";

const meeting = {
  adminBody: "Δημοτικό Συμβούλιο",
  meetingName: null,
  meetingKind: "regular",
  sessionNumber: 3,
  meetingDate: "2026-03-12T16:00:00.000Z",
};

describe("meetingLabel", () => {
  it("is the body, the title that the facts give and the date", () => {
    expect(meetingLabel(meeting)).toBe("Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026");
    expect(meetingLabel(meeting, { date: false })).toBe("Δημοτικό Συμβούλιο · 3η Τακτική");
  });

  it("puts an override in the place of the title", () => {
    expect(meetingLabel({ ...meeting, meetingName: "Λογοδοσία 04/02/26", meetingKind: "accountability" })).toBe(
      "Δημοτικό Συμβούλιο · Λογοδοσία 04/02/26 · 12/03/2026",
    );
  });

  it("prints the date once for a meeting of unknown kind", () => {
    expect(meetingLabel({ ...meeting, meetingKind: null })).toBe("Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026");
  });

  it("shows the stored name of a record from before the facts", () => {
    expect(meetingLabel({ adminBody: null, meetingName: "Δημοτικό Συμβούλιο 12/03", meetingDate: meeting.meetingDate })).toBe(
      "Δημοτικό Συμβούλιο 12/03 · 12/03/2026",
    );
  });
});
