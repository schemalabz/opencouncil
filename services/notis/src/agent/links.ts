/**
 * Links the model is allowed to send.
 *
 * Every opencouncil.gr URL in a message must be one this wake can vouch for:
 * it stood in a tool result, in the brief, in the conversation or in the
 * prompt — or its last path segment did, an id the model lifted from a field
 * (a subject's introducedBy.id, a meetingId). In production the model
 * composed https://opencouncil.gr/athens/people/dukas from the mayor's name
 * on a wake that called no tool at all, and the reader tapped a 404.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'«»()[\]{}]+/gi;
/** Sentence punctuation a message hangs on a link; never part of the address. */
const TRAILING_PUNCTUATION = /[.,;:!?…]+$/u;

export function extractLinks(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map((u) => u.replace(TRAILING_PUNCTUATION, ""));
}

function isOpenCouncilHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "opencouncil.gr" || host.endsWith(".opencouncil.gr");
}

/**
 * A content block the server produced inside an assistant turn — an MCP or
 * web tool result. These vouch for a link; the model's own blocks (its text,
 * its tool calls) never do, or a link invented in one turn would vouch for
 * itself in the next.
 */
export function isServerResultBlock(block: unknown): boolean {
  const type = (block as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.endsWith("_tool_result");
}

/**
 * What prompt text may vouch for: only the links written in it. The prose of
 * the system prompt names bad examples («/people/dukas») and words that are
 * also ids, and a substring search over it would ground the very link the
 * guard exists to hold.
 */
export function linksOnly(texts: string[]): string {
  return texts.flatMap(extractLinks).join("\n");
}

/**
 * The opencouncil.gr links in `text` that `known` does not vouch for.
 *
 * `known` is everything the wake has read: the system prompt, the user turn
 * (brief, conversation, profile) and every tool result. A link is vouched
 * for when the known text contains it — which also covers a meeting page
 * cut from a subject url — or contains its last path segment. A query
 * string (?t=seconds) and a trailing slash do not count against it; the site
 * root is always real. Other hosts are not this module's business.
 */
export function findUngroundedLinks(text: string, known: string): string[] {
  const out: string[] = [];
  for (const raw of extractLinks(text)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (!isOpenCouncilHost(url.hostname)) continue;
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "") continue;
    const canonical = `${url.protocol}//${url.hostname}${path}`;
    if (known.includes(canonical)) continue;
    const segment = path.slice(path.lastIndexOf("/") + 1);
    if (segment.length >= 3 && known.includes(segment)) continue;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}
