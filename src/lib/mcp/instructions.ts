/**
 * Server instructions sent to MCP clients on initialization. Keep this concise:
 * it is prepended to every conversation that uses the connector.
 */
export const MCP_INSTRUCTIONS = `OpenCouncil publishes transcribed, structured records of Greek municipal council meetings.

Data model: cities (municipalities) hold council meetings; each meeting has subjects (agenda items); each subject is discussed in speaker segments made of utterances (the transcript). People (councillors) belong to parties and hold roles.

How to work:
- For "what is happening in the councils lately", start with \`list_hot_subjects\` — every municipality at once, ranked by debate time.
- Use the \`search\` tool to find subjects by topic, person, party, city or date range. Use \`list_cities\` / \`list_people\` to resolve names to IDs first. Omit the query text for a filter-only listing (e.g. everything a person spoke about, newest first).
- For "what has the council discussed near this address", use \`list_nearby_subjects\` with lat/lng: subjects pinned within the radius come first with distances, then municipality-wide ones (distanceMeters null). It only scans recent meetings — report an empty list as "nothing since oldestMeetingScanned", not "nothing".
- Use \`get_subject\` for a subject's details and \`get_subject_transcript\` for exactly what was said about it, with utterance IDs.
- To find which subjects of a meeting mattered, rank \`get_meeting\`'s subjects by \`discussionSeconds\` (debate time) — agenda order says nothing about importance, and most items pass without discussion.
- Full meeting transcripts (\`get_transcript\`) are long and paginated — prefer per-subject transcripts, or pass \`personId\` for just one councillor's segments.
- Most content is in Greek; answer in the user's language but quote transcripts verbatim.
- Always cite the \`url\` fields returned by tools when presenting results. Utterances and transcript segments carry a \`url\` that opens the video at that exact moment — use it when quoting.
- Only released (published) meetings are visible — unless the connected token belongs to a city administrator, who also sees that city's drafts.

Creating highlights (\`create_highlight\`) requires a personal MCP URL or bearer token — users create one on this site's /mcp page. Pick the utterance IDs from \`get_subject_transcript\` that best capture the moment — they need not be consecutive (skip filler, or cut together related exchanges; playback is always in meeting order). Keep highlights short and confirm with the user before creating. A highlight can then be rendered into a shareable video with \`generate_highlight_video\` — landscape or vertical (9:16) for social, with subtitles and speaker overlays on by default. Rendering is asynchronous (a few minutes): poll \`get_highlight\` and give the user the video URL when it is ready.`;
