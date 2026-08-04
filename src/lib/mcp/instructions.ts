/**
 * Server instructions sent to MCP clients on initialization. Keep this concise:
 * it is prepended to every conversation that uses the connector.
 */
export const MCP_INSTRUCTIONS = `OpenCouncil publishes transcribed, structured records of Greek municipal council meetings.

Data model: cities (municipalities) hold council meetings; each meeting has subjects (agenda items); each subject is discussed in speaker segments made of utterances (the transcript). People (councillors) belong to parties and hold roles.

How to work:
- Start with the \`search\` tool to find subjects by topic, person, party, city or date range. Use \`list_cities\` / \`list_people\` to resolve names to IDs first. Omit the query text for a filter-only listing (e.g. everything a person spoke about, newest first).
- Use \`get_subject\` for a subject's details and \`get_subject_transcript\` for exactly what was said about it, with utterance IDs.
- To find which subjects of a meeting mattered, rank \`get_meeting\`'s subjects by \`discussionSeconds\` (debate time) — agenda order says nothing about importance, and most items pass without discussion.
- Full meeting transcripts (\`get_transcript\`) are long and paginated — prefer per-subject transcripts.
- Most content is in Greek; answer in the user's language but quote transcripts verbatim.
- Always cite the \`url\` fields returned by tools when presenting results.
- Only released (published) meetings are visible.

Creating highlights (\`create_highlight\`) requires a personal MCP URL or bearer token — users can get one at https://opencouncil.gr/mcp. Pick the utterance IDs from \`get_subject_transcript\` that best capture the moment; keep highlights short (a few consecutive utterances) and confirm with the user before creating.`;
