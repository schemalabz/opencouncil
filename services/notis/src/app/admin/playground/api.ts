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
}

export async function fetchCities(): Promise<CityOption[]> {
  const { result } = await post<{ result: { cities?: CityOption[] } | CityOption[] }>(
    "/api/proxy/mcp",
    { tool: "list_cities", args: {} },
  );
  const cities = Array.isArray(result) ? result : (result.cities ?? []);
  return cities.map((c) => ({ id: c.id, name: c.name }));
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

export async function fetchMeetings(
  cityId: string,
  from: string,
  to: string,
): Promise<MeetingSummary[]> {
  const all: MeetingSummary[] = [];
  for (let page = 1; page <= 4; page++) {
    const { result } = await post<{
      result: { meetings?: Array<{ id: string; name: string; dateTime: string }> };
    }>("/api/proxy/mcp", {
      tool: "list_meetings",
      args: { cityId, from, to, pageSize: 50, page },
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

export async function fetchShippedPrompt(): Promise<string> {
  const res = await fetch("/api/prompt");
  if (!res.ok) throw new Error(`prompt fetch failed: ${res.status}`);
  const data = (await res.json()) as { system: string };
  return data.system;
}
