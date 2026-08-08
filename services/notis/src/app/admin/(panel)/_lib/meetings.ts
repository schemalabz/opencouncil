import { post } from "./http";

/** Meeting metadata for timeline hover cards (admin body + most-discussed subjects). */

export interface MeetingDetails {
  adminBody?: string;
  topSubjects: Array<{ name: string; minutes: number }>;
}

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
