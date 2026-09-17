import { subscriptionRoster, type SubscriptionRow } from "@/lib/subscription-roster";

const at = (iso: string) => new Date(iso);

const sub = (
  userId: string,
  createdAt: string,
  unsubscribedAt: string | null = null,
  status = unsubscribedAt ? "unsubscribed" : "active",
): SubscriptionRow => ({
  userId,
  status,
  createdAt: at(createdAt),
  unsubscribedAt: unsubscribedAt ? at(unsubscribedAt) : null,
});

describe("subscriptionRoster", () => {
  const targets = [
    { userId: "a", cityId: "athens" },
    { userId: "a", cityId: "chania" },
    { userId: "a", cityId: "athens" },
    { userId: "b", cityId: "athens" },
  ];

  it("carries each subscription's municipalities, once each", () => {
    const [entry] = subscriptionRoster([sub("a", "2026-06-01T10:00:00Z")], targets);
    expect(entry).toEqual({
      userId: "a",
      cityIds: ["athens", "chania"],
      createdAt: "2026-06-01T10:00:00.000Z",
      endedAt: null,
    });
  });

  it("leaves endedAt null while the subscription is on, and dates it once it stops", () => {
    const roster = subscriptionRoster(
      [sub("a", "2026-06-01T10:00:00Z"), sub("b", "2026-08-25T10:00:00Z", "2026-09-08T09:00:00Z")],
      targets,
    );
    expect(roster.map((entry) => entry.endedAt)).toEqual([null, "2026-09-08T09:00:00.000Z"]);
  });

  it("reads a stopped subscription with no stop date as stopped from its start", () => {
    const [entry] = subscriptionRoster([sub("c", "2026-06-01T10:00:00Z", null, "unsubscribed")], []);
    expect(entry).toEqual({
      userId: "c",
      cityIds: [],
      createdAt: "2026-06-01T10:00:00.000Z",
      endedAt: "2026-06-01T10:00:00.000Z",
    });
  });

  it("is empty on an empty service", () => {
    expect(subscriptionRoster([], [])).toEqual([]);
  });
});
