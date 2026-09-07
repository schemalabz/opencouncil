/** Sentinel markers wrapping the matched spans in an Elasticsearch highlight
 * fragment (see buildSearchQuery's `highlight` block).
 *
 * Private-use code points rather than HTML (`<em>`) or ASCII: a fragment is
 * localized and markdown-stripped on its way to the screen, and only a marker
 * outside every text transform survives that trip intact.
 *  - `stripMarkdown` matches markdown punctuation; these are neither.
 *  - Serbian transliteration rewrites `\p{L}` runs, which would mangle an
 *    ASCII marker into `оц7Х1гхЛ1гхтСтарт9q`; private-use chars are category
 *    Co, not letters, so it leaves them alone.
 *  - Real content cannot contain them: they have no keyboard, no font, and no
 *    meaning outside this pair.
 *
 * The client splits on them as plain strings — it never parses markup, so no
 * `dangerouslySetInnerHTML` is involved.
 */
export const MATCH_START = '\uE000';
export const MATCH_END = '\uE001';

/** The fields we ask Elasticsearch to mark up, and therefore the fields a
 * SearchMatches can carry. */
export const MATCH_FIELDS = ['name', 'description', 'location_text'] as const;
