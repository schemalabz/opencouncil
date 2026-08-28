/**
 * Server instructions sent to MCP clients on initialization. Keep this concise:
 * it is prepended to every conversation that uses the connector.
 */
export const MCP_INSTRUCTIONS = `OpenCouncil publishes transcribed, structured records of Greek municipal council meetings.

Data model: cities (municipalities) hold council meetings; each meeting has subjects (agenda items); each subject is discussed in speaker segments made of utterances (the transcript). People (councillors) belong to parties and hold roles.

How to work:
- For "what is happening in the councils lately", start with \`list_hot_subjects\` — every municipality at once, ranked by debate time.
- Use the \`search\` tool to find subjects by topic, person, party, city or date range. Use \`list_cities\` / \`list_people\` to resolve names to IDs first. Omit the query text for a filter-only listing (e.g. everything a person spoke about, newest first).
- A \`search\` query returns subjects ranked by relevance, not by date. The top hit is not the newest one, and a page of results is not the whole record — never read "not on page 1" as "does not exist".
- For "when did this body last meet", use \`list_meetings\` with \`administrativeBodyIds\` and \`timeFilter: "past"\` — \`get_city\` lists the bodies and their ids. Without \`timeFilter\` the top row can be a meeting that has not happened yet. \`search\` cannot answer this at all: it ranks subjects, and carries no body filter.
- For "what has the council discussed near this address", use \`list_nearby_subjects\` with lat/lng: subjects pinned within the radius come first with distances, then municipality-wide ones (distanceMeters null). It only scans recent meetings — report an empty list as "nothing since oldestMeetingScanned", not "nothing".
- Use \`get_subject\` for a subject's details and \`get_subject_transcript\` for exactly what was said about it, with utterance IDs.
- To find which subjects of a meeting mattered, rank \`get_meeting\`'s subjects by \`discussionSeconds\` (debate time) — agenda order says nothing about importance, and most items pass without discussion.
- A meeting with no subjects is not an empty meeting. Subjects come from a summarization step that runs after transcription, so a meeting is often transcribed long before it has an agenda. Check \`hasTranscript\` on \`get_meeting\` (and on \`list_meetings\` rows): when it is true, \`get_transcript\` holds the full verbatim record, and everything the subject tools do — summarizing, quoting, picking utterances for a highlight — you can do from there. Never report such a meeting as having nothing to show.
- Full meeting transcripts (\`get_transcript\`) are long and paginated — prefer per-subject transcripts, or pass \`personId\` for just one councillor's segments.
- Most content is in Greek; answer in the user's language but quote transcripts verbatim.
- Always cite the \`url\` fields returned by tools when presenting results. Utterances and transcript segments carry a \`url\` that opens the video at that exact moment — use it when quoting.
- Only released (published) meetings are visible — unless the connected token belongs to a city administrator, who also sees that city's drafts.

Creating highlights (\`create_highlight\`) requires a personal MCP URL or bearer token — users create one on this site's /mcp page, and the highlight tools only appear on connections authenticated that way. If the user asks for highlights and you see no highlight tools, tell them to reconnect with a personal MCP URL (a service key unlocks them too). Pick the utterance IDs from \`get_subject_transcript\` — or from \`get_transcript\` with \`includeUtteranceIds\`, for a meeting that is not summarized yet — that best capture the moment. They need not be consecutive (skip filler, or cut together related exchanges; playback is always in meeting order). Keep highlights short.

Ask the user to confirm a highlight once, and settle the video in that same question. When they want a clip, pass \`video\` to \`create_highlight\` — landscape or vertical (9:16) for social, with subtitles and speaker overlays on by default — rather than calling \`generate_highlight_video\` after it. Creating a highlight and rendering it are one step, and a second confirmation for a clip the user already asked for only wastes their time. \`generate_highlight_video\` is for re-rendering an existing highlight in another format, or for one created without a video. Rendering is asynchronous (a few minutes): poll \`get_highlight\` and give the user the video URL when it is ready.`;
