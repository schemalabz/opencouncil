import { meetingLabel } from "../meetingLabel";

const meeting = {
  adminBody: "Δημοτικό Συμβούλιο",
  meetingName: null,
  meetingKind: "ordinary",
  urgent: false,
  sessionNumber: 3,
  meetingDate: "2026-03-12T16:00:00.000Z",
};

describe("meetingLabel", () => {
  it("is the body, the title that the facts give and the date", () => {
    expect(meetingLabel(meeting)).toBe("Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026");
    expect(meetingLabel(meeting, { date: false })).toBe("Δημοτικό Συμβούλιο · 3η Τακτική");
  });

  it("names the urgency of a meeting", () => {
    expect(meetingLabel({ ...meeting, urgent: true, sessionNumber: 2 })).toBe("Δημοτικό Συμβούλιο · 2η Έκτακτη · 12/03/2026");
    expect(meetingLabel({ ...meeting, urgent: true, meetingKind: "budget", sessionNumber: null })).toBe(
      "Δημοτικό Συμβούλιο · Έκτακτη Ειδική Προϋπολογισμού · 12/03/2026",
    );
    expect(meetingLabel({ ...meeting, urgent: null })).toBe("Δημοτικό Συμβούλιο · 3η Τακτική · 12/03/2026");
  });

  it("ignores the stored name of a meeting with a kind", () => {
    expect(meetingLabel({ ...meeting, meetingName: "Λογοδοσία 04/02/26", meetingKind: "accountability" })).toBe(
      "Δημοτικό Συμβούλιο · 3η Ειδική Λογοδοσίας · 12/03/2026",
    );
  });

  it("is the stored name alone for a meeting without a kind", () => {
    expect(meetingLabel({ ...meeting, meetingName: "Δημοτικό Συμβούλιο 12/03/26", meetingKind: null })).toBe(
      "Δημοτικό Συμβούλιο 12/03/26",
    );
  });

  it("prints the date once for a meeting of unknown kind", () => {
    expect(meetingLabel({ ...meeting, meetingKind: null })).toBe("Δημοτικό Συμβούλιο · Συνεδρίαση 12/03/2026");
  });

  it("shows the stored name of a record from before the facts", () => {
    expect(meetingLabel({ adminBody: null, meetingName: "Δημοτικό Συμβούλιο 12/03", meetingDate: meeting.meetingDate })).toBe(
      "Δημοτικό Συμβούλιο 12/03",
    );
  });
});
