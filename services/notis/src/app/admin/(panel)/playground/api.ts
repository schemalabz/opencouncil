import { z } from "zod";
import { EditorialBrief, Effort, WakeEvent, WakeOutcome, WakeState, WakeTrace } from "@/agent/types";
import { post } from "../_lib/http";
import { MeetingSummary } from "./deriveQueue";
import { LocationPoint } from "./types";

/**
 * Upstream shapes are pinned with zod so contract drift fails loudly with a
 * named error instead of degrading into an empty wizard (the MCP advisory-
 * block incident: every consumer hedged a parse failure into an empty list).
 */
const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  logoImage: z.string().nullish(),
});

export type CityOption = z.infer<typeof citySchema>;

/** Cities come from the main app's REST API — the one surface that carries logos. */
export async function fetchCities(): Promise<CityOption[]> {
  const res = await fetch("/api/proxy/cities");
  if (!res.ok) throw new Error(`cities failed: ${res.status}`);
  const data: unknown = await res.json();
  const list = Array.isArray(data) ? data : ((data as { cities?: unknown[] }).cities ?? []);
  const parsed = z.array(citySchema).safeParse(list);
  if (!parsed.success) throw new Error(`cities: unexpected response shape (${parsed.error.issues[0]?.message})`);
  return parsed.data.map((c) => ({ id: c.id, name: c.name, logoImage: c.logoImage ?? null }));
}

const realUserSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  notisEnabledAt: z.string().nullable(),
  cities: z.array(
    z.object({
      cityId: z.string(),
      cityName: z.string(),
      topics: z.array(z.string()),
      // Coordinates are geometry centroids from the fanout view; null when
      // the source row predates the coordinate columns.
      locations: z.array(
        z.object({
          text: z.string(),
          lng: z.number().nullable(),
          lat: z.number().nullable(),
        }),
      ),
    }),
  ),
});

const realUsersResponseSchema = z.object({
  available: z.boolean(),
  users: z.array(realUserSchema),
});

export type RealUser = z.infer<typeof realUserSchema>;

/**
 * Real users from the notis_fanout_targets view, for "select a real user".
 * available:false means the deployment has no MAIN_DATABASE_URL — the wizard
 * hides the mode entirely.
 */
export async function fetchRealUsers(q = ""): Promise<{ available: boolean; users: RealUser[] }> {
  const res = await fetch(`/api/admin/real-users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  if (!res.ok) throw new Error(`real-users failed: ${res.status}`);
  const parsed = realUsersResponseSchema.safeParse(await res.json());
  if (!parsed.success)
    throw new Error(`real-users: unexpected response shape (${parsed.error.issues[0]?.message})`);
  return parsed.data;
}

const topicSchema = z.object({ id: z.string(), name: z.string() });

export type TopicOption = z.infer<typeof topicSchema>;

export async function fetchTopics(): Promise<TopicOption[]> {
  const res = await fetch("/api/proxy/topics");
  if (!res.ok) throw new Error(`topics failed: ${res.status}`);
  const data: unknown = await res.json();
  const list = Array.isArray(data) ? data : ((data as { topics?: unknown[] }).topics ?? []);
  const parsed = z.array(topicSchema).safeParse(list);
  if (!parsed.success) throw new Error(`topics: unexpected response shape (${parsed.error.issues[0]?.message})`);
  return parsed.data;
}

const meetingListSchema = z.object({
  meetings: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        dateTime: z.string(),
        administrativeBody: z.string().nullish(),
      }),
    )
    .optional(),
});

export async function fetchMeetings(cityId: string, from: string): Promise<MeetingSummary[]> {
  const all: MeetingSummary[] = [];
  for (let page = 1; page <= 4; page++) {
    const { result } = await post<{ result: unknown }>("/api/proxy/mcp", {
      tool: "list_meetings",
      args: { cityId, from, pageSize: 50, page },
    });
    const parsed = meetingListSchema.safeParse(result);
    if (!parsed.success) {
      throw new Error(`list_meetings: unexpected response shape (${parsed.error.issues[0]?.message})`);
    }
    const meetings = parsed.data.meetings ?? [];
    all.push(...meetings.map((m) => ({ ...m, cityId })));
    if (meetings.length < 50) break;
  }
  return all;
}

export async function fetchBrief(
  cityId: string,
  meetingId: string,
  phase: "agenda" | "summary",
): Promise<EditorialBrief> {
  const { brief } = await post<{ brief: EditorialBrief }>("/api/editorial-brief", {
    cityId,
    meetingId,
    phase,
  });
  return brief;
}

export interface DryRunResult {
  outcome: WakeOutcome;
  trace: WakeTrace;
  appliedState: WakeState;
}

export async function dryRun(
  state: WakeState,
  event: WakeEvent,
  options: {
    promptOverride?: string;
    contextPackOverride?: string;
    model?: string;
    maxTurns?: number;
    effort?: Effort;
  },
): Promise<DryRunResult> {
  return post<DryRunResult>("/api/dry-run", { state, event, options });
}

/**
 * Mapbox forward geocoding, biased to Greece and Greek results. Runs client
 * side (the token is public). Returns [] when no token is configured.
 */
export async function geocode(
  query: string,
  token: string | undefined,
  proximity?: { lng: number; lat: number },
  types = "address,neighborhood,locality,place,poi",
): Promise<LocationPoint[]> {
  if (!token || query.trim().length < 3) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&country=gr&language=el&limit=5` +
    `&types=${types}` +
    (proximity ? `&proximity=${proximity.lng},${proximity.lat}` : "");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: Array<{ place_name_el?: string; place_name: string; center: [number, number] }>;
  };
  return (data.features ?? []).map((f) => ({
    text: (f.place_name_el ?? f.place_name).replace(/, Ελλάδα$/, "").replace(/, Greece$/, ""),
    lng: f.center[0],
    lat: f.center[1],
  }));
}

export async function fetchShippedPrompt(): Promise<string> {
  const res = await fetch("/api/prompt");
  if (!res.ok) throw new Error(`prompt fetch failed: ${res.status}`);
  const data = (await res.json()) as { system: string };
  return data.system;
}
