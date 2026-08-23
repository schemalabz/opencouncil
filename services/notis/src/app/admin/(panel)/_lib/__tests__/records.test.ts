import { queueBackedRecords } from "../records";

/**
 * The thread synthesizes records for wakes still in the queue — the reader's
 * message exists before its NotisWake row does, and it must stay visible
 * while the wake is pending, retrying, or terminally failed (the exact
 * moments an operator is looking). These tests pin the projection.
 */

const MAX = 3;

function row(overrides: Partial<Parameters<typeof queueBackedRecords>[0][number]> = {}) {
  return {
    id: "q1",
    status: "pending",
    events: [{ type: "user_message", at: "2026-08-23T17:25:24.000Z", text: "Ας γνωριστούμε" }],
    attempts: 0,
    lastError: null,
    runAfter: new Date("2026-08-23T17:40:44.000Z"),
    ...overrides,
  };
}

describe("queueBackedRecords", () => {
  it("projects a fresh pending row: reader message visible, no retry hint", () => {
    const [rec] = queueBackedRecords([row()], MAX);
    expect(rec).toMatchObject({
      id: "queue:q1",
      status: "pending",
      event: { type: "user_message", text: "Ας γνωριστούμε" },
      queue: { state: "pending", attempts: 0, maxAttempts: MAX, lastError: null },
    });
    expect(rec.queue?.nextTryAt).toBeUndefined();
    expect(rec.outcome).toBeUndefined();
  });

  it("a retrying row carries its error and the next attempt instant", () => {
    const [rec] = queueBackedRecords(
      [row({ attempts: 2, lastError: "Cannot convert argument to a ByteString" })],
      MAX,
    );
    expect(rec.status).toBe("pending");
    expect(rec.queue).toMatchObject({
      state: "pending",
      attempts: 2,
      lastError: "Cannot convert argument to a ByteString",
      nextTryAt: "2026-08-23T17:40:44.000Z",
    });
  });

  it("a terminally failed row surfaces as a failed record without a retry", () => {
    const [rec] = queueBackedRecords(
      [row({ status: "failed", attempts: 4, lastError: "gave up after 3 attempts" })],
      MAX,
    );
    expect(rec.status).toBe("failed");
    expect(rec.queue).toMatchObject({ state: "failed", attempts: 4 });
    expect(rec.queue?.nextTryAt).toBeUndefined();
  });

  it("a running row stays a pending record with the running state", () => {
    const [rec] = queueBackedRecords([row({ status: "running", attempts: 1 })], MAX);
    expect(rec.status).toBe("pending");
    expect(rec.queue?.state).toBe("running");
    expect(rec.queue?.nextTryAt).toBeUndefined();
  });

  it("a coalesced batch row keeps its primary event and count", () => {
    const [rec] = queueBackedRecords(
      [
        row({
          events: [
            {
              type: "agenda_processed",
              at: "2026-08-23T15:30:00.000Z",
              cityId: "athens",
              meetingId: "m1",
              meetingName: "Συνεδρίαση",
              meetingDate: "2026-08-25",
              brief: {
                cityId: "athens",
                meetingId: "m1",
                generatedAt: "2026-08-23T15:30:00.000Z",
                headline: "Δοκιμαστική ατζέντα",
                meetingUrl: "https://opencouncil.gr/athens/m1",
                subjects: [],
              },
            },
            { type: "user_message", at: "2026-08-23T15:31:00.000Z", text: "τι λέει;" },
          ],
        }),
      ],
      MAX,
    );
    // user_message outranks meeting events in primaryEvent's ordering.
    expect(rec.event.type).toBe("user_message");
    expect(rec.coalesced).toBe(2);
  });

  it("drops rows whose events no longer parse instead of throwing", () => {
    const rows = [row({ events: [{ nonsense: true }] }), row({ id: "q2", events: null })];
    expect(queueBackedRecords(rows, MAX)).toEqual([]);
  });
});
