import { EditorialBrief, WakeEvent, WakeOutcome, WakeState, WakeTrace } from "@/agent/types";
import { MeetingSummary } from "./deriveQueue";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `${url} failed: ${res.status}`);
  }
  return data;
}

export interface CityOption {
  id: string;
  name: string;
  logoImage?: string | null;
}

/** Cities come from the main app's REST API — the one surface that carries logos. */
export async function fetchCities(): Promise<CityOption[]> {
  const res = await fetch("/api/proxy/cities");
  if (!res.ok) throw new Error(`cities failed: ${res.status}`);
  const data = (await res.json()) as CityOption[] | { cities?: CityOption[] };
  const cities = Array.isArray(data) ? data : (data.cities ?? []);
  return cities.map((c) => ({ id: c.id, name: c.name, logoImage: c.logoImage ?? null }));
}

export interface MeetingDetails {
  adminBody?: string;
  topSubjects: Array<{ name: string; minutes: number }>;
}

/** Meeting metadata for the timeline hover card (admin body + most-discussed subjects). */
export async function fetchMeetingDetails(
  cityId: string,
  meetingId: string,
): Promise<MeetingDetails> {
  const { result } = await post<{
    result: {
      meeting?: {
        administrativeBody?: string | null;
        subjects?: Array<{ name: string; discussionSeconds?: number }>;
      };
    } & {
      administrativeBody?: string | null;
      subjects?: Array<{ name: string; discussionSeconds?: number }>;
    };
  }>("/api/proxy/mcp", { tool: "get_meeting", args: { cityId, meetingId } });
  const m = result.meeting ?? result;
  const topSubjects = (m.subjects ?? [])
    .map((s) => ({ name: s.name, seconds: s.discussionSeconds ?? 0 }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 3)
    .map((s) => ({ name: s.name, minutes: Math.round(s.seconds / 60) }));
  return { adminBody: m.administrativeBody ?? undefined, topSubjects };
}

export interface TopicOption {
  id: string;
  name: string;
}

export async function fetchTopics(): Promise<TopicOption[]> {
  const res = await fetch("/api/proxy/topics");
  if (!res.ok) throw new Error(`topics failed: ${res.status}`);
  const data = (await res.json()) as { topics?: TopicOption[] } | TopicOption[];
  return Array.isArray(data) ? data : (data.topics ?? []);
}

export async function fetchMeetings(cityId: string, from: string): Promise<MeetingSummary[]> {
  const all: MeetingSummary[] = [];
  for (let page = 1; page <= 4; page++) {
    const { result } = await post<{
      result: { meetings?: Array<{ id: string; name: string; dateTime: string }> };
    }>("/api/proxy/mcp", {
      tool: "list_meetings",
      args: { cityId, from, pageSize: 50, page },
    });
    const meetings = result.meetings ?? [];
    all.push(...meetings.map((m) => ({ ...m, cityId })));
    if (meetings.length < 50) break;
  }
  return all;
}

export async function fetchBrief(cityId: string, meetingId: string): Promise<EditorialBrief> {
  const { brief } = await post<{ brief: EditorialBrief }>("/api/editorial-brief", {
    cityId,
    meetingId,
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
  options: { promptOverride?: string; model?: string; maxTurns?: number },
): Promise<DryRunResult> {
  return post<DryRunResult>("/api/dry-run", { state, event, options });
}

export interface GeocodeHit {
  text: string;
  lng: number;
  lat: number;
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
): Promise<GeocodeHit[]> {
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
