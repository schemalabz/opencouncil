import { estypes } from '@elastic/elasticsearch';
import { SearchRequest, ExtractedFilters, Location } from './types';
import { env } from '@/env.mjs';
import { HIGHLIGHT_START, HIGHLIGHT_END } from './constants';
import type { AdministrativeBodyType } from '@prisma/client';

// Score added ONCE to a subject pinned within an AI-extracted location's radius
// (see buildLocationClause). Small next to the lexical field tiers (FIELD_TIER):
// proximity breaks ties among text matches, it does not outrank a better text
// match.
const LOCATION_BOOST = 2;

/**
 * Similarity cutoff for the semantic fallback clause, measured against the
 * production index (scripts/search-eval.ts). The gate is the BEST of the two
 * sub-field similarities (see buildSemanticFallbackQuery), so the value is a
 * plain normalized cosine in [0, 1] and means what it says: "the closest thing
 * this document has to say scores at least this well".
 *
 * It replaces an earlier cutoff of 3.23 applied to the BOOSTED SUM of the two
 * sub-fields. That was unusable by construction: the sub-field boosts (2.0 and
 * 1.5) cap each field's contribution, so the sum could only reach 3.23 when
 * BOTH fields scored near their ceiling. It read as a quality bar and behaved
 * as an agreement bar — a perfect title match contributes at most ~1.95, so it
 * still needed the description to supply ~0.85 similarity to pass, whatever the
 * title said. Measured consequences on the live index (Aug 2026, 9.1k released
 * docs):
 *   - "ηλεκτρικά πατίνια" — a logged user query with the HIGHEST title
 *     similarity of any on-topic query measured (0.9546) — returned zero
 *     semantic hits, because its descriptions disagreed.
 *   - "χώροι για παρκάρισμα" admitted `Μίσθωση χώρου για Λούνα Παρκ` (leasing
 *     space for a funfair) while rejecting `Ανάκληση θέσης πάρκινγκ ΑμεΑ`,
 *     `Κόκκινα κολωνάκια και χώροι στάθμευσης` and `Ηλεκτρικά πατίνια -
 *     Παρκάρισμα σε πεζοδρόμια`. Their title scores differed by 0.5%;
 *     description agreement decided.
 *   - The whole arm admitted 1-10 documents per query out of 9,116.
 *
 * Calibration of the current value, over 12 on-topic, 11 paraphrase and 26
 * off-topic queries (the off-topic set drawn from the SearchQuery table):
 *   - on-topic best hit:    0.9399 - 0.9546
 *   - paraphrase best hit:  0.9314 - 0.9499
 *   - off-topic best hit:   0.8968 - 0.9300, plus one outlier at 0.9389
 * The bands touch, so no cutoff is perfectly separating. 0.930 sits just under
 * the paraphrase floor: it keeps 12/12 on-topic and 11/11 paraphrase queries,
 * and admits one off-topic query ("23ερ ε σ=", a keyboard mash whose digits
 * anchor to a street number in `Ανοιχτό σκάμμα Ευελπίδων 23`) with 2 documents.
 * The old sum cutoff scored 11/12 and 10/11 for 0 off-topic — it bought that
 * last junk query by throttling every real query's recall 3-5x.
 *
 * Re-measured Aug 2026 at 9,181 released docs, which is 65 more than the
 * calibration above saw. The bands have moved apart, and the value moved with
 * them, from 0.930 to 0.934:
 *   - The off-topic ceiling ROSE. "ηνκξκ", a logged keyboard mash, reaches
 *     0.9319 against one subject (`Μεταστέγαση ΕΝΕΓΙΛ`), so 0.930 stopped
 *     emptying it. The nearest neighbour of a mash is arbitrary, so expect this
 *     ceiling to keep moving as the index grows.
 *   - The paraphrase floor ROSE further, to somewhere in [0.936, 0.940): every
 *     paraphrase query still returns at 0.936, and "λεφτά για τον αθλητισμό"
 *     empties at 0.940.
 * That leaves a separating window where the calibration above had none. 0.934
 * sits in the middle of it: ~0.002 above the junk ceiling and ~0.002 below the
 * paraphrase floor, so neither side is one document away from crossing.
 *
 * The cost is paraphrase DEPTH, not paraphrase recall — no query goes empty,
 * but the thinnest one ("χώροι για παρκάρισμα") returns 9 documents at 0.930,
 * 6 at 0.932 and 2 at 0.936. That is why this sits mid-window instead of at the
 * top of it: the arm exists for recall, and the junk it admits is one document
 * on one query.
 *
 * Re-run the sweep when the eval suite starts to fail on either side:
 *
 *     SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --min-score 0.934
 *
 * Do not normalize before applying this: `minmax` maps the best hit to exactly
 * 1.0 for every query, which makes any fractional cutoff unable to empty the
 * results.
 */
const DEFAULT_SEMANTIC_MIN_SCORE = 0.934;

/**
 * Mapping of the similarity into BM25 space for the dis_max fallback
 * (see buildSemanticFallbackQuery): mapped = BASE + (raw - cutoff) * SCALE.
 * Calibrated against the flattened lexical tiers (FIELD_TIER):
 *   - Weak stem-coincidence lexical matches (both stems of a 2-term query
 *     landing in one long description, e.g. bar licenses matching
 *     "ζώα χωρίς ιδιοκτήτη" via ζω/ιδιοκτητ) flatten to ~24-30
 *     (descriptionTerm + descriptionPhrase bands); BASE sits inside that
 *     band, so a genuine paraphrase-only match competes with them.
 *   - A real name match flattens to ~58+ (nameTerm + namePhrase), so the
 *     mapped ceiling stays below any title match.
 * SCALE spreads the useful similarity band over ~8 points so semantic ordering
 * still matters among paraphrase-only hits. That band is ~0.025 wide (cutoff
 * to the observed 0.955 ceiling), where the old boosted-sum band was ~0.08 —
 * hence the 3.2x larger scale for the same mapped spread.
 */
const SEMANTIC_MAPPED_BASE = 26;
const SEMANTIC_MAPPED_SCALE = 320;

/**
 * A single-term query matches on its term; a 2-term query requires both terms
 * (ES's combination form treats clause counts <= the leading integer as
 * all-required); a query of 3+ terms requires 75% of them, so a single stray
 * matching term no longer surfaces a low-relevance hit. Requiring both terms
 * of a 2-term query is deliberate: measured on the production index, OR-ing
 * them floods the results with one-word matches (a query like "πάρκα Κυψέλης"
 * would surface every park in every city), while requiring both keeps the
 * results on-subject. Stopwords do not count: the greek analyzer drops them
 * before this applies, so "συνταγή για μουσακά" is a 2-term query.
 */
const LEXICAL_MINIMUM_SHOULD_MATCH = '2<75%';

/**
 * Fields whose content is a subset of a mixed query by construction, and the
 * gate that makes LEXICAL_MINIMUM_SHOULD_MATCH mean what it was meant to mean.
 *
 * The term requirement above is evaluated per field, and a per-field threshold
 * silently assumes every field could hold the whole query. That holds for
 * name/description/transcript. It fails for the entity fields
 * (introduced_by_person_name, location_text, speaker_person_name), whose whole
 * content is a name or a place. There the threshold is never a real test — it
 * is either trivially met or impossible:
 *   - A councillor's two-word name satisfies 2-of-3 of "Ιωάννης Μαλτέζος
 *     υδρονομείς" on its own. Measured on the production index, that clause
 *     matched all 93 subjects the person introduced, while the name and
 *     description clauses matched 0 (neither field reaches 2-of-3 on the topic
 *     word alone). The results were then the same 93 subjects in the same order
 *     for every topic word, including the one subject that actually matched all
 *     three terms — it ranked 2nd, 1.4% behind an unrelated one.
 *   - A one-word location can never satisfy 2-of-2 of "σχολεία Άργους", so the
 *     location_text clause was unreachable for its purpose. It fired only where
 *     the topic word happened to name the building ("4ο Δημοτικό Σχολείο
 *     Άργους"), which put three subjects about tree cutting and object disposal
 *     above the actual school-maintenance subject.
 *
 * The fix splits the two jobs the threshold was doing at once:
 *   - Precision ("do not surface a document that matched one stray term") is a
 *     per-DOCUMENT question, so buildCoverageGate asks it once across the union
 *     of the fields.
 *   - Evidence weighting ("a field that covers more of the query is a stronger
 *     signal") stays per field, but becomes graded instead of all-or-nothing:
 *     see PARTIAL_COVERAGE_SHARE.
 */
const COVERAGE_GATE_FIELDS = [
    'name',
    'description',
    'introduced_by_person_name',
    'location_text'
] as const;

/**
 * The gate's threshold for the one entity field that cannot join the union
 * above: speaker_person_name is nested, so it stands as its own alternative and
 * decides eligibility ALONE (see buildCoverageGate).
 *
 * That is the per-field threshold this whole split was built to remove, so it
 * cannot take LEXICAL_MINIMUM_SHOULD_MATCH: at 2-of-3, the two-word name
 * "Ιωάννης Μαλτέζος" admits every subject the person merely spoke in for
 * "Ιωάννης Μαλτέζος υδρονομείς", none of which match the topic word anywhere.
 * Ranking already put them last (FIELD_TIER.speakerName), but they still filled
 * track_total_hits with ~93 subjects and filled the pages behind the real ones.
 *
 * Requiring the whole query instead keeps the recall the clause exists for — a
 * bare person-name query ("Χάρης Δούκας", "Μαλτέζος", "του Δούκα") is fully
 * covered by the name, so the subjects the person spoke in still qualify — while
 * a person-plus-topic query has to find its topic term somewhere else, which is
 * the only place it can be judged. Subjects the person INTRODUCED are unaffected:
 * their name is in the combined_fields union, where covering part of the query is
 * a legitimate contribution to the document's coverage.
 */
const SPEAKER_NAME_GATE_MINIMUM_SHOULD_MATCH = '100%';

/**
 * Share of a field's tier awarded for covering only part of the query.
 *
 * Every lexical field emits two clauses instead of one: the strict clause
 * (LEXICAL_MINIMUM_SHOULD_MATCH, as before) at 1 - PARTIAL_COVERAGE_SHARE of
 * the tier, and a partial clause (any single term) at PARTIAL_COVERAGE_SHARE.
 * Both fire when the field covers the query, so a full match still totals
 * exactly the tier value in FIELD_TIER — the whole existing calibration
 * (tier separation, the 1.42x post-relevance multiplier, the semantic mapping)
 * carries over untouched. A partial match, which scored nothing at all before,
 * now enters below every full match in the same tier.
 *
 * This is what restores the topic word to a person-name query: for "Ιωάννης
 * Μαλτέζος υδρονομείς" the subject that also matches the topic in its title
 * adds the name tier's partial share on top of the introducer tier, while the
 * other 92 subjects the person introduced score the introducer tier alone.
 *
 * Raw BM25 cannot carry this signal instead: flattenToTier deliberately
 * discards its magnitude (see FIELD_TIER), so a field matching 1 of 3 terms and
 * one matching 3 of 3 land within ~7% of each other — inside the reach of the
 * post-relevance multiplier. Coverage has to be scored explicitly.
 */
const PARTIAL_COVERAGE_SHARE = 0.35;

/**
 * Apostrophe-like characters normalized to the ASCII apostrophe before any
 * clause sees the query: the single quotes mobile keyboards auto-substitute
 * (U+2018/U+2019), the modifier apostrophe (U+02BC), the Greek tonos (U+0384)
 * and acute accent (U+00B4) that official minutes use as apostrophes in names
 * like ΔΙ΄ΕΥΧΩΝ, and the Greek koronis/psili (U+1FBD/U+1FBF). Without this,
 * the same query succeeds or fails depending on which keyboard typed it.
 */
const APOSTROPHE_VARIANTS = /[‘’ʼ΄´᾽᾿]/g;

/**
 * Typo tolerance is restricted to the name field, exact-only elsewhere.
 * Measured on the production index: fuzziness on description let off-topic
 * queries through, because long descriptions offer a large surface of terms
 * one edit away from a query's stems ("lava" matched a French description via
 * "lave"; "συνταγή"/"μουσακά" matched "συντήρηση"/"μουσική" descriptions).
 * Names are short keyword summaries, so a fuzzy match there has to line up
 * with what the subject is actually about — and a real typo query still
 * recovers, since anything worth finding carries its key terms in the name.
 *
 * AUTO:4,10 = 1 edit for terms of 4-9 chars, 2 edits only at 10+. The default
 * AUTO allows 2 edits from 6 chars up, which is too loose for Greek: stemmed
 * words are mostly 5-9 chars and 2 edits conflate unrelated stems
 * (συνταγ -> συντηρ). prefix_length 2 avoids noisy 1-char-prefix expansions.
 */
const NAME_FUZZINESS = 'AUTO:4,10';
const NAME_FUZZY_PREFIX_LENGTH = 2;

/**
 * A person-name query answers with the subjects the person is responsible for
 * (FIELD_TIER.introducer). The subjects they only spoke in answer the same
 * query weakly, so they belong in the tail: the speakerName tier is the
 * lowest in the query, under the transcript's.
 *
 * The boost decides only where those subjects rank, never whether they are
 * found — a should-clause either matches or it does not. Measured on the
 * production index (Aug 2026, 9.1k released docs), the recall it adds is the
 * point of the clause, and it is the same at every boost:
 *   "Χάρης Δούκας"  38 -> 110 hits    "Μαλτέζος"  120 -> 216
 *   "του Δούκα"     94 -> 154         topic queries: no change at all
 * Junk queries stay empty, because no name matches their terms.
 *
 * The speakerName tier in FIELD_TIER is calibrated on how far the clause may
 * reorder the first page (measured at the pre-tier boost 0.1, re-checked after
 * the tier flattening): for the worst case in the index — an Athens mayor who
 * speaks in 91 subjects and introduced 34 — it moves 2 subjects into the top
 * 10; every other measured query moves 0-1. Two slots on the single heaviest
 * speaker is the intended dose: the page still leads with what the person
 * introduced, and the rest of what they spoke in follows behind it.
 *
 * The earlier decision here was to leave the field unsearched, on the reasoning
 * that a mayor speaks in nearly every subject. The measurements above do not
 * support that: a speaker reaches 2-3x the subjects they introduce, not the
 * whole index, because a subject only carries contributions once the summarize
 * task has run on it. The personIds filter is still the right tool for
 * "everything this person spoke about" — it is exact, and it does not rank.
 */

/**
 * Field-tier score flattening: every lexical clause is rescored to
 * base + k * log1p(bm25), so WHICH fields matched (the tiers: name >
 * description/introducer > transcript > speaker name) set the score level,
 * raw BM25 shrinks to a small within-tier tiebreak, and the post-relevance
 * multiplier (admin body, discussion length, recency; up to ~1.45x at the
 * longest discussions in the index) decides among same-tier matches.
 *
 * Raw BM25 must not rank within a tier: measured on the production index
 * ("δάνειο"), two title matches differed by 26% in summed BM25 purely through
 * title length normalization (3 vs 4 stemmed tokens) and description term
 * repetition — noise, not relevance — which buried a recent, heavily-debated
 * subject under an old, briefly-discussed one. Under the flattening the same
 * pair differs by ~2% before the multiplier, so recency and discussion decide.
 *
 * A document does NOT sit in one tier. The clauses share a single bool.should
 * (see buildLexicalShouldClauses), so a document collects the tier of EVERY
 * clause it matches, and its score is that sum. Measured on the production
 * index (final scores, after the multiplier): a real title match reaches
 * ~150-210, because all six of nameTerm, namePhrase, fuzzyName,
 * descriptionTerm, descriptionPhrase and transcript fire together. The
 * strongest sum without any name clause — introducer + descriptionTerm +
 * descriptionPhrase + transcript + speakerName — reaches ~107. That
 * measurement predates the strict/partial coverage split, and it counts only
 * documents with NO name clause at all; the arithmetic below is the worse case.
 *
 * Name dominance is therefore NOT a property of these constants — the
 * constants do not even establish it. On bases alone a title match reaches 64
 * (nameTerm 40 + namePhrase 20 + fuzzyName 4) from its title alone, while the
 * strongest stack against it reaches 71.3. That stack is not name-free: the
 * partial half of the name clause takes a single matching term (see
 * PARTIAL_COVERAGE_SHARE), so one title word plus introducer + descriptionTerm
 * + descriptionPhrase + transcript + speakerName also collects the name tier's
 * partial share (14). The log parts widen the gap rather than closing it (the
 * stacked document sums k = 15.3 against the title match's 11.0). No metadata
 * multiplier is needed to invert that pair — the arithmetic already does.
 *
 * What actually keeps title matches on top is a property of the data: a
 * subject's title terms recur in its description and its debate, so a title
 * match's clause set is in practice a superset of a stacked non-title match's,
 * not a competitor at a similar level.
 *
 * That correlation is an empirical claim about the corpus, so it is measured
 * rather than trusted:
 *
 *     SKIP_ENV_VALIDATION=1 npx tsx scripts/search-eval.ts --tier-margin
 *
 * The check runs the surname/topic stem collisions this file worries about
 * elsewhere against the live index, and reports each query's ratio between its
 * weakest title match and its strongest non-title hit, with the multiplier
 * stripped so the ratio measures the tiers alone. A ratio above
 * MAX_RANKING_MULTIPLIER_RATIO means no metadata can invert that pair; below it,
 * only the current metadata is holding the order. It exits 1 when a non-title
 * hit actually outranks a title match. Run it after changing a base, a k, or a
 * multiplier weight — the arithmetic alone will not warn you.
 *
 * Last run (Aug 2026, 9.1k released docs): zero inversions, 19 of 27 measurable
 * queries structurally safe against a 1.484 ceiling.
 *
 * The eight inside the multiplier's reach are almost all MULTI-TERM, and the
 * split is sharp: one-word queries measure 1.50-2.57, multi-term queries
 * 1.11-1.86. The partial share above is why. A multi-term query hands its name
 * tier's partial share to any document that carries ONE of its terms in the
 * title, and the greek stemmer creates that case constantly, because it does
 * not always map an inflection to the stem the query produces: σχολικές stems
 * to σχολικ while Σχολικών stems to σχολ, so `Κατάργηση Σχολικών Επιτροπών`
 * takes the partial share of "σχολικές επιτροπές" and never the strict clause.
 * "χώροι πρασίνου" is the tightest measured pair at 1.11.
 *
 * So the corpus correlation holds, but it holds with far less room on a
 * multi-term query than the earlier one-word-only query set suggested. Nothing
 * is inverted today, and only metadata separates those eight pairs.
 * ("Δούκας" at 1.47 predates the harness fixes and re-measures the same, so it
 * was never an artifact of them.)
 *
 * Within one tier the multiplier is meant to decide, and k per tier keeps the
 * log tiebreak's spread near +-5%, well under the multiplier's reach. The
 * semantic fallback maps into the description band (see SEMANTIC_MAPPED_BASE).
 */
const FIELD_TIER = {
    nameTerm: { base: 40, k: 6 },
    namePhrase: { base: 20, k: 3 },
    descriptionTerm: { base: 15, k: 4 },
    descriptionPhrase: { base: 8, k: 2 },
    // Between name and description: for a person-name query, the subjects the
    // person introduced must lead the ones that only mention them in the
    // description or transcript (there is no title to compete with — names
    // rarely appear in subject titles), while for topic queries a real title
    // match still outranks a same-named introducer (stem collisions like
    // Δήμος the surname vs δήμος the word).
    introducer: { base: 28, k: 4 },
    // Sized like LOCATION_BOOST, not like a content field. The clause scores
    // the extracted location name, so it fires on EVERY subject in the place —
    // it says where a subject is, never what it is about. At the description
    // tier it drowned the topic: for "σχολεία Άργους" every Argos subject
    // gained the same 15, which put tree cutting and a theatre booking above
    // school maintenance. Kept small, it orders topic matches by place.
    locationText: { base: 3, k: 1 },
    // Uniform for correctly-spelled queries (a fuzzy expansion includes the
    // exact term), the only name-tier signal for typo queries.
    fuzzyName: { base: 4, k: 2 },
    transcript: { base: 6, k: 3 },
    speakerName: { base: 0.3, k: 0.2 },
} as const;

// Rescores a clause to its tier band: base + k * log1p(bm25). boost_mode
// replace discards the raw BM25 magnitude; the log term keeps its ordering as
// a within-tier tiebreak.
function flattenToTier(
    query: estypes.QueryDslQueryContainer,
    tier: { base: number; k: number }
): estypes.QueryDslQueryContainer {
    return {
        function_score: {
            query,
            functions: [
                {
                    script_score: {
                        script: {
                            source: 'params.base + params.k * Math.log1p(_score)',
                            params: { base: tier.base, k: tier.k }
                        }
                    }
                }
            ],
            boost_mode: 'replace'
        }
    };
}

// Scales a tier band so a field can award part of it. Both base and k scale, so
// the log tiebreak keeps the same proportion to its band at every share.
function scaleTier(tier: { base: number; k: number }, factor: number): { base: number; k: number } {
    return { base: tier.base * factor, k: tier.k * factor };
}

// Collapses one field's alternate-spelling clauses (see buildQueryTextVariants)
// into a single clause scored by the BEST spelling.
//
// The spellings are renderings of the SAME query, so they must never sum. As
// independent should-clauses they did: a document matching one spelling in full
// also collected the OTHER spelling's partial share, because the two spellings
// differ only in their punctuated token and the partial clause needs just one
// term. Measured on `τιμολόγια Δ.Ε.Υ.Α.Χ.`, whose name clauses offered 80 base
// points across two spellings against a nameTerm tier of 40: `Τιμολόγια ΔΕΥΑΧ`
// scored 54, and `Τιμολόγια νερού` — which matches the common word and not the
// acronym at all — scored 28, the whole introducer tier, for half a match.
// dis_max with tie_breaker 0 keeps whichever spelling the index holds and
// discards the rest, so the field totals its tier exactly, as FIELD_TIER says.
function anySpelling(clauses: estypes.QueryDslQueryContainer[]): estypes.QueryDslQueryContainer {
    return clauses.length === 1
        ? clauses[0]
        : { dis_max: { queries: clauses, tie_breaker: 0 } };
}

// Emits the strict/partial clause pair for one field (see PARTIAL_COVERAGE_SHARE).
// `build` takes the minimum_should_match to apply, so each caller keeps its own
// clause shape (plain match, nested, alternate spelling).
function coverageClauses(
    build: (minimumShouldMatch: string | number) => estypes.QueryDslQueryContainer,
    tier: { base: number; k: number }
): estypes.QueryDslQueryContainer[] {
    return [
        flattenToTier(
            build(LEXICAL_MINIMUM_SHOULD_MATCH),
            scaleTier(tier, 1 - PARTIAL_COVERAGE_SHARE)
        ),
        flattenToTier(build(1), scaleTier(tier, PARTIAL_COVERAGE_SHARE)),
    ];
}

/**
 * Post-relevance ranking: nudges among otherwise-similar matches by administrative
 * body, discussion length, and recency. All three combine into one multiplier via a
 * script so their spreads stay comparable and legible from the constants below,
 * rather than depending on the native (and very different) scales of built-in
 * function_score functions like field_value_factor and decay functions.
 */

// Council meetings usually carry city-wide decisions, committees narrower ones,
// communities the smallest scope. This only nudges among otherwise-similar
// matches — a clearly better text match still wins regardless of body type.
//
// Search and ADMIN_BODY_TIER in src/lib/ranking/subjects.ts — the app's single
// standard subject-importance ranking (meeting cards, the meeting dashboard,
// list_hot_subjects, …) — must agree on which body type outranks which. ONLY the
// ordering is shared, and it is shared as a property the tests assert, not by
// reading the other table's numbers.
//
// Reading them was wrong, not merely indirect. Nothing in subjects.ts fixes its
// magnitudes: rankSubjects z-scores that column, and a z-score is invariant to
// any affine rescale, so {1, 0.5, 0} and {1, 0, -1} rank identically there. The
// second one is the natural way to write a centred scale, and it would have made
// community and unassigned subjects score 0.85 here — a penalty, and one the
// floor promised below forbids. It would also have understated
// rankingMultiplierRatio, which assumes every floor is 1.0, so the tier-margin
// check would have reported unsafe pairs as safe.
//
// The shares below are search's own scale: a fraction of ADMIN_BODY_BOOST_WEIGHT
// per body type, floored at 1.0 so no body type is ever penalised. The two files
// need different shapes anyway — subjects.ts z-scores an already-fetched
// in-memory batch, which a per-document Elasticsearch script cannot do (there is
// no "the rest of the result set" to compare against at scoring time).
const ADMIN_BODY_BOOST_WEIGHT = 0.15;
const ADMIN_BODY_BOOST_SHARE: Record<AdministrativeBodyType, number> = {
    council: 1,
    committee: 0.5,
    community: 0,
};
const ADMIN_BODY_WEIGHT: Record<AdministrativeBodyType, number> = {
    council: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_BOOST_SHARE.council,
    committee: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_BOOST_SHARE.committee,
    community: 1 + ADMIN_BODY_BOOST_WEIGHT * ADMIN_BODY_BOOST_SHARE.community,
};
// No administrative body assigned ranks like the lowest tier (community), not the
// best one — never below the floor of 1.0 (no penalty), just no boost.
const DEFAULT_ADMIN_BODY_WEIGHT = ADMIN_BODY_WEIGHT.community;

// log1p(minutes) keeps a subject the council spent an hour on from dominating one
// that got a brief mention. At this weight an hour-long discussion nets roughly
// +12% over one barely discussed at all. Reuses discussion_speaking_seconds
// (already indexed on SubjectSearchView for score rescoring), not a meeting-wide
// duration — a subject's own discussion length, not the whole session's.
const DISCUSSION_LENGTH_BOOST_WEIGHT = 0.03;

// Exponential decay: at RECENCY_DECAY_SCALE_DAYS old, a meeting keeps ~37% (1/e) of
// the recency boost. The multiplier floors at 1.0 (no boost), never goes below it —
// an old meeting loses the recency edge, it isn't penalized for its age.
const RECENCY_BOOST_WEIGHT = 0.1;
const RECENCY_DECAY_SCALE_DAYS = 365;

/**
 * Longest discussion in the index, in minutes (318.4 measured on the production
 * index, Aug 2026, 9.1k released docs). Only the ratio below reads it — the
 * ranking script itself has no ceiling.
 *
 * This is a snapshot of a number that only grows, so nothing may TRUST it: the
 * tier-margin check measures the live maximum itself and calls
 * rankingMultiplierRatio with that, which is what keeps the guard honest as the
 * index grows. The constant is the offline default, for the unit tests and for
 * reading the arithmetic here.
 */
const LONGEST_DISCUSSION_MINUTES = 318.4;

/**
 * The widest ratio the post-relevance multiplier can open between two documents:
 * every factor at its ceiling over every factor at its floor. All three floors
 * are 1.0 (each factor is a boost that is never a penalty), so this is just the
 * product of the ceilings. Only the discussion length is unbounded, so it is the
 * one input: pass the longest discussion in the index, in minutes.
 *
 * This is the number that decides whether the field tiers hold. Because the
 * lexical clauses share one bool.should, a document's score is the SUM of every
 * tier it matched (see FIELD_TIER), so nothing in the constants stops a stack of
 * low tiers from reaching a single high one — only the data does. Two documents
 * of different tiers sitting closer than this ratio are documents the multiplier
 * alone can reorder.
 *
 * Exported for the tier-margin check in scripts/search-eval.ts, which measures
 * that distance against the live index. Keep it derived from the weights above
 * rather than hardcoded, so changing a weight moves the check with it.
 */
export function rankingMultiplierRatio(longestDiscussionMinutes: number): number {
    return ADMIN_BODY_WEIGHT.council *
        (1 + DISCUSSION_LENGTH_BOOST_WEIGHT * Math.log1p(longestDiscussionMinutes)) *
        (1 + RECENCY_BOOST_WEIGHT);
}

/** The ratio at the last measured index size — see LONGEST_DISCUSSION_MINUTES. */
export const MAX_RANKING_MULTIPLIER_RATIO = rankingMultiplierRatio(LONGEST_DISCUSSION_MINUTES);

const RANKING_SCRIPT = `
    String bodyType = doc['administrative_body_type'].size() == 0 ? '' : doc['administrative_body_type'].value;
    double adminWeight = bodyType == 'council' ? params.councilWeight
        : bodyType == 'committee' ? params.committeeWeight
        : bodyType == 'community' ? params.communityWeight
        : params.defaultAdminBodyWeight;

    double discussionMinutes = doc['discussion_speaking_seconds'].size() == 0 ? 0 : doc['discussion_speaking_seconds'].value / 60.0;
    double discussionFactor = 1 + params.discussionWeight * Math.log1p(discussionMinutes);

    // A missing meeting_date is neutral (factor 1), like the other two signals
    // above — not the same as ageDays=0, which would be the *maximum* possible
    // recency boost (a meeting happening right now).
    double recencyFactor = 1.0;
    if (doc['meeting_date'].size() != 0) {
        double ageDays = (params.nowMillis - doc['meeting_date'].value.toInstant().toEpochMilli()) / 86400000.0;
        recencyFactor = 1 + params.recencyWeight * Math.exp(-Math.max(ageDays, 0) / params.recencyScaleDays);
    }

    return adminWeight * discussionFactor * recencyFactor;
`;

function buildRankingFunction(): estypes.QueryDslFunctionScoreContainer {
    return {
        script_score: {
            script: {
                source: RANKING_SCRIPT,
                params: {
                    councilWeight: ADMIN_BODY_WEIGHT.council,
                    committeeWeight: ADMIN_BODY_WEIGHT.committee,
                    communityWeight: ADMIN_BODY_WEIGHT.community,
                    defaultAdminBodyWeight: DEFAULT_ADMIN_BODY_WEIGHT,
                    discussionWeight: DISCUSSION_LENGTH_BOOST_WEIGHT,
                    recencyWeight: RECENCY_BOOST_WEIGHT,
                    recencyScaleDays: RECENCY_DECAY_SCALE_DAYS,
                    nowMillis: Date.now(),
                },
            },
        },
    };
}

// Wraps a scored query with the ranking function. `multiply` nudges an existing
// relevance score, which is the only role this function has: it is a tiebreak
// among text matches, never a sort key of its own. The filter-only browse path
// therefore does not use it at all (see buildSearchQuery).
function applyRanking(
    query: estypes.QueryDslQueryContainer
): estypes.QueryDslQueryContainer {
    return {
        function_score: {
            query,
            functions: [buildRankingFunction()],
            boost_mode: 'multiply',
        },
    };
}

// Build filters for the search query
export function buildFilters(request: SearchRequest): estypes.QueryDslQueryContainer[] {
    const filters: estypes.QueryDslQueryContainer[] = [];

    // Always filter for released meetings only
    filters.push({
        term: {
            'meeting_released': true
        }
    });

    // Add city filter if specified
    if (request.cityIds && request.cityIds.length > 0) {
        filters.push({
            terms: {
                'city_id': request.cityIds
            }
        });
    }

    // Add person filter if specified.
    // A subject is relevant to a person if they EITHER introduced it OR spoke in it.
    // These two clauses must be OR-combined inside a single `bool.should`; pushing
    // them as separate entries in the top-level `filter` array would AND them, which
    // almost never matches (the person rarely both introduces and speaks in the same
    // subject) and breaks search on every person profile page.
    if (request.personIds && request.personIds.length > 0) {
        filters.push({
            bool: {
                should: [
                    // Introduced by the person
                    {
                        terms: {
                            'introduced_by_person_id': request.personIds
                        }
                    },
                    // Spoke in the subject (nested speaker contributions)
                    {
                        nested: {
                            path: 'speaker_contributions',
                            query: {
                                terms: {
                                    'speaker_contributions.speaker_person_id': request.personIds
                                }
                            }
                        }
                    }
                ],
                minimum_should_match: 1
            }
        });
    }

    // Add party filter if specified
    if (request.partyIds && request.partyIds.length > 0) {
        filters.push({
            terms: {
                'introduced_by_party_id': request.partyIds
            }
        });
    }

    // Add administrative body filter if specified. The two clauses are
    // independent: `adminBodyIds` selects named bodies, `adminBodyTypes` selects
    // every body of a type. The UI sets both when the user picks a named body,
    // and they agree — a body has exactly one type.
    if (request.adminBodyIds && request.adminBodyIds.length > 0) {
        filters.push({
            terms: {
                'administrative_body_id': request.adminBodyIds
            }
        });
    }

    if (request.adminBodyTypes && request.adminBodyTypes.length > 0) {
        filters.push({
            terms: {
                'administrative_body_type': request.adminBodyTypes
            }
        });
    }

    // Add topic filter if specified
    if (request.topicIds && request.topicIds.length > 0) {
        filters.push({
            terms: {
                'topic_id': request.topicIds
            }
        });
    }

    // Add date range filter if specified
    if (request.dateRange) {
        filters.push({
            range: {
                'meeting_date': {
                    gte: request.dateRange.start,
                    lte: request.dateRange.end
                }
            }
        });
    }

    return filters;
}

// Location proximity, as ONE clause: "pinned near any of the extracted
// locations". Only the AI filter-extraction path produces `locations` (no UI,
// API or MCP caller passes them).
//
// The collapse is not cosmetic. processFilters geocodes the extracted name in
// EVERY municipality (it calls getCities() with no realm argument), and adjacent
// Attica cities bias Google Places towards the same landmark, so one extracted
// place routinely resolves to about ten near-identical points. As separate
// should-clauses on the scoring query they each scored, so a subject inside K of
// those radii collected K x LOCATION_BOOST: +20 at K=10, which is the whole
// namePhrase tier and more than descriptionTerm. Proximity has to break ties
// among text matches, never outrank a better text match, so the boost is
// awarded once for being near the place — however many points the geocoder
// returned for it.
//
// It must NOT become a hard filter on a text search: only ~45% of subjects carry
// a location pin, and a geo_distance filter drops every pin-less document. A
// query like "παλαιστίνη" — extracted as a location and geocoded somewhere —
// would then return zero results even though subjects carry it in the title. The
// scored path wraps this clause in a constant_score under `should`, so nearby
// pinned subjects rank higher and everything else still matches on text alone.
//
// The radius is in METRES (Location.radiusMeters), so the geo_distance unit
// suffix must be `m`. Reading it as `km` made the clause useless without
// failing: at the then-current 40000m it asked for 40000km, past the ~20015km
// maximum distance between two points on Earth, so every pinned subject matched
// and the clause degenerated into a flat bonus for carrying a pin at all, with
// no proximity signal left in it.
function buildLocationClause(
    locations: Location[] | undefined
): estypes.QueryDslQueryContainer | undefined {
    if (!locations || locations.length === 0) return undefined;
    return {
        bool: {
            should: locations.map(loc => ({
                geo_distance: {
                    distance: `${loc.radiusMeters}m`,
                    'location_geojson': {
                        lat: loc.point.lat,
                        lon: loc.point.lon
                    }
                }
            })),
            minimum_should_match: 1
        }
    };
}

// Transcripts are long enough that a bare OR match lets an off-topic query match
// on one common word, so they take the same term requirement as the title fields.
// The transcript's place at the bottom of the field tier (a transcript is the
// noisiest field — routine words like "προϋπολογισμός" occur in almost every
// meeting's discussion) comes from FIELD_TIER.transcript on the wrapper, not
// from a boost here.
function buildTranscriptMatch(
    field: string,
    queryText: string,
    minimumShouldMatch: string | number = LEXICAL_MINIMUM_SHOULD_MATCH
): estypes.QueryDslQueryContainer {
    return {
        match: {
            [field]: {
                query: queryText,
                minimum_should_match: minimumShouldMatch
            }
        }
    };
}

// Alternate spellings for intra-word punctuation that the standard tokenizer
// keeps inside its tokens, so the query only reaches the index spelling that
// used the exact same punctuation. Two classes, both measured on the
// production index (hyphens, slashes, case and diaeresis all tokenize
// identically on both sides and need no variant):
//
// - Apostrophes: a typed δι'ευχών stays one token (δι'ευχ), but official
//   minutes write ΔΙ΄ΕΥΧΩΝ with a Greek tonos, which splits (δι, ευχ). The
//   space-split variant matches the split-token form.
// - Dotted acronyms: a typed Δ.Ε.Υ.Α.Χ. stays one token (δ.ε.υ.α.χ), but
//   long acronyms are indexed plain (ΔΕΥΑΧ — 70 subjects vs 0 dotted). The
//   glued variant matches the plain form. The reverse direction (typed ΔΕΡΤΟ
//   vs indexed Δ.Ε.Ρ.Τ.Ο.) cannot be fixed from the query side — the query
//   builder cannot know where dots belong; that direction needs an index-time
//   char_filter and a reindex.
function buildQueryTextVariants(queryText: string): string[] {
    const variants = new Set<string>();
    if (queryText.includes("'")) {
        variants.add(queryText.replace(/'/g, ' '));
    }
    if (/\p{L}\.\p{L}/u.test(queryText)) {
        variants.add(queryText.replace(/(?<=\p{L})\.(?=\p{L})/gu, ''));
    }
    variants.delete(queryText);
    return [...variants];
}

// Every spelling one piece of query text can take in the index: the alternate
// spellings above, then the punctuation-normalized text itself. Applied to the
// AI-extracted location name too, not just the user's query — the extractor is
// as free to return a smart quote or a Greek tonos as a mobile keyboard is, and
// an unnormalized ΔΙ΄-style spelling tokenizes differently from the indexed
// location_text, which drops the location tier out of the ranking in silence.
//
// EVERY clause reads its text through this, the coverage gate included. A clause
// family left on the raw query text does not simply miss its share — it
// mis-ranks and it drops documents:
//   - Score. For `τιμολόγια Δ.Ε.Υ.Α.Χ.`, the subjects the index holds plain
//     (`Τιμολόγια ΔΕΥΑΧ`) reached the nameTerm tier alone while an identical
//     subject indexed dotted also collected namePhrase and descriptionPhrase.
//     Index punctuation, not relevance, decided a 28-point gap.
//   - Recall. The gate admits a document per spelling, so a subject that names
//     the acronym only in its debate passed the gate on the glued spelling. With
//     the transcript clause still querying the dotted token, no should-clause
//     matched — the fuzzy clause cannot bridge δ.ε.υ.α.χ to δευαχ at
//     prefix_length 2 — and minimum_should_match 1 dropped the document. The
//     gate paid for a nested query per spelling that could not produce a hit.
function spellingsOf(text: string): string[] {
    const normalized = text.replace(APOSTROPHE_VARIANTS, "'");
    return [...buildQueryTextVariants(normalized), normalized];
}

// The name field's typo-tolerant match. Shared so the coverage gate and the
// scoring clause cannot drift apart: the gate is exact-only without it, and a
// typo query would be rejected before the clause built to recover it can score.
function buildFuzzyNameMatch(text: string): estypes.QueryDslQueryContainer {
    return {
        match: {
            'name': {
                query: text,
                fuzziness: NAME_FUZZINESS,
                prefix_length: NAME_FUZZY_PREFIX_LENGTH,
                minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
            }
        }
    };
}

/**
 * Document-level precision gate: the query's terms must be covered across the
 * union of the searchable fields, rather than by any single field on its own
 * (see COVERAGE_GATE_FIELDS for what the per-field form got wrong).
 *
 * Applied in filter context, so it decides only WHICH documents are eligible.
 * All scoring stays with the tiered should-clauses.
 *
 * combined_fields treats its fields as one combined field, which is exactly the
 * per-document question, and it requires every field to share one analyzer —
 * all four are `greek`. The nested fields cannot join a combined_fields, so the
 * transcript and the speaker name are separate alternatives: a document
 * qualifies when the flat fields TOGETHER cover the query, or when the
 * transcript does, or when a speaker name covers it WHOLE (a nested field
 * decides alone, so it takes the stricter threshold — see
 * SPEAKER_NAME_GATE_MINIMUM_SHOULD_MATCH). Coverage cannot be pooled
 * across the nested boundary (Elasticsearch scores nested documents
 * separately), so a subject whose title holds the topic and whose speaker list
 * holds the name still does not qualify — the same limit as before this gate,
 * and one that only a flat copy of the speaker names at index time can lift.
 *
 * Alternate spellings each get their own alternative, otherwise the gate would
 * reject a query whose only index spelling is a variant (Δ.Ε.Υ.Α.Χ. is indexed
 * plain) before its variant clauses could score it.
 */
function buildCoverageGate(queryText: string): estypes.QueryDslQueryContainer {
    const spellings = spellingsOf(queryText);
    return {
        bool: {
            should: spellings.flatMap(text => [
                {
                    combined_fields: {
                        query: text,
                        fields: [...COVERAGE_GATE_FIELDS],
                        minimum_should_match: LEXICAL_MINIMUM_SHOULD_MATCH
                    }
                },
                buildFuzzyNameMatch(text),
                {
                    nested: {
                        path: 'speaker_contributions',
                        query: {
                            bool: {
                                should: [
                                    buildTranscriptMatch('speaker_contributions.text', text),
                                    {
                                        match: {
                                            'speaker_contributions.speaker_person_name': {
                                                query: text,
                                                minimum_should_match: SPEAKER_NAME_GATE_MINIMUM_SHOULD_MATCH
                                            }
                                        }
                                    }
                                ],
                                minimum_should_match: 1
                            }
                        }
                    }
                }
            ]),
            minimum_should_match: 1
        }
    };
}

// Lexical should-clauses: BM25 match on title/description/transcripts.
function buildLexicalShouldClauses(
    queryText: string,
    extractedFilters: ExtractedFilters
): estypes.QueryDslQueryContainer[] {
    // Name and description sit in different tiers, so each field gets its own
    // clause (a shared best_fields multi_match could not carry two bases).
    // Matching several fields sums their tiers — more evidence, higher score —
    // which preserves the old multi_match-plus-phrases additivity. That sum is
    // also what stops the tiers from being ranks: a document collects every
    // tier it matches, so a stack of low tiers can approach a single high one.
    // FIELD_TIER holds the measured margins and the check that watches them.
    //
    // Every term clause is a strict/partial pair (see PARTIAL_COVERAGE_SHARE):
    // covering the whole query in a field still totals that field's tier,
    // covering part of it now scores the tier's partial share instead of
    // nothing. buildCoverageGate keeps the loosened clauses from admitting
    // stray-term matches.
    //
    // A field's alternate spellings (see buildQueryTextVariants) all live inside
    // ONE clause per half of the pair, so whichever shape the index holds scores
    // the same tier and no document can collect two spellings at once — see
    // anySpelling. Every clause family below is built this way: a family left on
    // the raw query text reaches only the index spelling that matched the typed
    // punctuation, which both mis-ranks and drops documents (see spellingsOf).
    const spellings = spellingsOf(queryText);
    const perSpelling = (
        build: (text: string) => estypes.QueryDslQueryContainer
    ): estypes.QueryDslQueryContainer => anySpelling(spellings.map(build));

    const termClause = (field: string, texts: string[]) =>
        (minimumShouldMatch: string | number): estypes.QueryDslQueryContainer =>
            anySpelling(texts.map(text => ({
                match: {
                    [field]: {
                        query: text,
                        minimum_should_match: minimumShouldMatch
                    }
                }
            })));

    return [
        ...coverageClauses(termClause('name', spellings), FIELD_TIER.nameTerm),
        ...coverageClauses(termClause('description', spellings), FIELD_TIER.descriptionTerm),
        // Person-name queries ("Χάρης Δούκας", "Μαλτέζος") are a recurring
        // pattern in the logged user searches. This field covers the subjects
        // the person introduced — the strongest authorship signal. The subjects
        // they only spoke in match through the much weaker nested speaker-name
        // clause below. The greek analyzer also stems name declensions, so
        // "του Δούκα" matches "Δούκας".
        //
        // The pair matters most here: the full name earns the whole introducer
        // tier, while a query that shares only a first name with the introducer
        // earns the partial share. Before the split, both scored the same.
        ...coverageClauses(termClause('introduced_by_person_name', spellings), FIELD_TIER.introducer),
        // Matched against the EXTRACTED location name, not the whole query. The
        // field holds a place ("Άργος", "4ο Δημοτικό Σχολείο Άργους"), so
        // scoring it against "σχολεία Άργους" asks an address to answer the
        // topic word too. That inverted the clause: it stayed silent for the
        // subjects actually in the place, and fired only where the topic word
        // happened to name the building, which put three subjects about tree
        // cutting and object disposal above the school-maintenance subject.
        // Given the location term here, the topic term is left to the name and
        // description clauses, which is the only place it can be judged.
        ...(extractedFilters.locationName
            ? coverageClauses(
                termClause('location_text', spellingsOf(extractedFilters.locationName)),
                FIELD_TIER.locationText
            )
            : []),
        // Typo tolerance for citizen-style queries (often misspelled), on the
        // name field only — see NAME_FUZZINESS for why description is exact-only.
        // For correctly-spelled queries this adds a near-uniform tier score (a
        // fuzzy expansion includes the exact term); for typo queries it is the
        // only clause that matches. No partial twin: a fuzzy match on a single
        // term of a multi-term query is the noisiest signal in the query, and
        // the gate would have to admit the document on that term alone.
        flattenToTier(perSpelling(buildFuzzyNameMatch), FIELD_TIER.fuzzyName),
        // Phrase match on the title: a contiguous phrase match in the most
        // important field should clearly outrank scattered terms. Phrases are
        // all-or-nothing by nature, so they take no partial twin.
        flattenToTier(
            perSpelling(text => ({ match_phrase: { 'name': { query: text } } })),
            FIELD_TIER.namePhrase
        ),
        // Phrase match on the description, a tier below the title phrase so
        // long descriptions don't overweight phrase proximity.
        flattenToTier(
            perSpelling(text => ({ match_phrase: { 'description': { query: text } } })),
            FIELD_TIER.descriptionPhrase
        ),
        // No inner_hits: nothing between here and the search results reads them
        // (partitionHits works off `_source.id`), so requesting them made
        // Elasticsearch run a sub-search per hit and return a payload no code
        // opened. Restore the block here, and wire the contribution ids through
        // src/lib/search/hits.ts, if a caller ever needs to know WHICH
        // contributions matched.
        ...coverageClauses(
            minimumShouldMatch => perSpelling(text => ({
                nested: {
                    path: 'speaker_contributions',
                    query: buildTranscriptMatch(
                        'speaker_contributions.text',
                        text,
                        minimumShouldMatch
                    )
                }
            })),
            FIELD_TIER.transcript
        ),
        // Subjects the person spoke in, at the bottom of the field tier (see
        // FIELD_TIER.speakerName and the calibration note above it). A separate
        // nested clause rather than a second field on the transcript clause
        // above: the two carry different tiers, and a subject the person spoke
        // in is a far weaker answer than one whose debate says the words.
        ...coverageClauses(
            minimumShouldMatch => perSpelling(text => ({
                nested: {
                    path: 'speaker_contributions',
                    query: {
                        match: {
                            'speaker_contributions.speaker_person_name': {
                                query: text,
                                minimum_should_match: minimumShouldMatch
                            }
                        }
                    }
                }
            })),
            FIELD_TIER.speakerName
        )
    ];
}

// Semantic kNN returns nearest neighbours for every query, however unrelated,
// so without a cutoff an off-topic query still fills a page of results. The
// `min_score` drops the neighbours that only look close on the model's
// compressed similarity scale.
//
// The two sub-fields combine with dis_max (score = MAX of the two), not by
// summing a boosted `bool.should`. The sum made the cutoff an agreement test
// rather than a quality test — see DEFAULT_SEMANTIC_MIN_SCORE for the measured
// damage. Under max, each field is judged on its own: a document whose title
// paraphrases the query passes on the title alone, and the score carries a
// plain similarity that the cutoff can be reasoned about in.
//
// The sub-fields are deliberately UNBOOSTED. A boost here would not express a
// field preference, it would rescale the gate: with boosts 2.0/1.5 the max is
// almost always the name field regardless of which field actually matched
// better, and the cutoff would no longer be a similarity. Field preference is
// the lexical tiers' job (FIELD_TIER); this arm is a fallback, and what matters
// is only whether the document says something close to the query at all.
//
// This whole clause is one side of a dis_max with the lexical clauses (score =
// max, not sum), NOT a second retriever fused with rank-based RRF, and NOT an
// additive clause. Both alternatives failed on measured cases:
//   - RRF double-counted whichever document happened to clear the cutoff
//     (a second reciprocal-rank vote, worth ~2x), so a 4-minute loan
//     discussion outranked a 139-minute one whose semantic score fell just
//     below the cutoff ("δάνειο", lexical gap between them only ~2%).
//   - An additive bonus cannot be sized at all: lexical scores of strong
//     matches sit ~2 points apart while weak-but-junky lexical matches score
//     20-40, so any bonus big enough to lift a paraphrase-only match over
//     junk would also flip the strong matches.
// Under dis_max the semantic path is mapped into the description-tier score
// range (SEMANTIC_MAPPED_BASE + margin * SEMANTIC_MAPPED_SCALE) and max()
// structurally caps its power: a document with a strong lexical score keeps
// it unchanged, a paraphrase-only document enters at description strength —
// above transcript-only mentions and weak stem-coincidence matches, below
// any real name match. Off-topic queries still return nothing: below the
// cutoff the mapped score falls under min_score and the clause does not
// match, and the lexical side never matched in the first place.
function buildSemanticFallbackQuery(
    queryText: string,
    semanticMinScore: number
): estypes.QueryDslQueryContainer {
    const semanticQuery: estypes.QueryDslQueryContainer = {
        dis_max: {
            queries: [
                {
                    semantic: {
                        query: queryText,
                        field: 'name.semantic'
                    }
                },
                {
                    semantic: {
                        query: queryText,
                        field: 'description.semantic'
                    }
                }
            ],
            // Pure max: a tie_breaker share of the weaker field would put the
            // agreement requirement back, in smaller print.
            tie_breaker: 0
        }
    };

    return {
        function_score: {
            query: semanticQuery,
            functions: [
                {
                    script_score: {
                        script: {
                            // Clamped at 0 because Elasticsearch rejects negative
                            // script scores outright: a distant neighbour scores
                            // well below the cutoff and would map negative, failing
                            // the whole request rather than just missing min_score.
                            // The clamp keeps the score legal; min_score below
                            // still does the actual gating.
                            source: 'Math.max(params.base + (_score - params.cutoff) * params.scale, 0)',
                            params: {
                                base: SEMANTIC_MAPPED_BASE,
                                cutoff: semanticMinScore,
                                scale: SEMANTIC_MAPPED_SCALE
                            }
                        }
                    }
                }
            ],
            boost_mode: 'replace',
            // min_score applies to the adjusted score: similarities below the
            // cutoff map below `base` and are dropped, keeping the
            // zero-results behaviour for off-topic queries.
            min_score: SEMANTIC_MAPPED_BASE
        }
    };
}

// Build the search query
export function buildSearchQuery(
    request: SearchRequest,
    extractedFilters: ExtractedFilters
): estypes.SearchRequest {
    // `request` already carries the AI-extracted city ids and date range: the
    // caller merges them (search() in ./index.ts). Merging them again here
    // would put the raw extracted city ids back, past the realm cap the caller
    // applies to them, and let a query name a municipality of another realm.
    // `extractedFilters` is still read below for the location-name clause.
    //
    // Filter-only search: no query text to rank on, so skip the text clauses
    // (they require a query) and return the filtered set newest-first. Used e.g.
    // for "everything a person spoke about" or "all subjects in a date range".
    const queryText = request.query?.trim().replace(APOSTROPHE_VARIANTS, "'");
    const filters = buildFilters(request);
    if (!queryText) {
        // With no text to score, a location can only act as a filter — so the
        // clause enters in filter context, where it contributes no score.
        // Unreachable today (locations only come from AI extraction, which
        // requires query text), but kept so an explicit filter-only location
        // request stays a location browse rather than being ignored.
        const locationClause = buildLocationClause(request.locations);
        const browseFilters = locationClause ? [...filters, locationClause] : filters;
        return {
            index: env.ELASTICSEARCH_INDEX,
            size: request.config?.size || 10,
            from: request.config?.from || 0,
            track_total_hits: true,
            query: { bool: { filter: browseFilters } },
            // Newest first, NOT the ranking function. That function is calibrated as
            // a tiebreak between text matches (see RANKING_SCRIPT), so it cannot
            // order a browse listing: its administrative-body span (up to 1.15)
            // is wider than its recency span (up to 1.10), so the council factor's
            // floor stays above the community factor's ceiling. A council subject of
            // any age then outranks a community subject from today, and date order
            // disappears from a listing whose whole purpose is date order.
            //
            // `id` breaks ties because every subject of one meeting carries the same
            // meeting_date. Without a unique second key, Elasticsearch orders tied
            // documents arbitrarily per shard request, so paging through a person's
            // subjects can repeat one subject and skip another.
            sort: [
                { 'meeting_date': { order: 'desc' } },
                { 'id': { order: 'asc' } }
            ]
        };
    }

    // One scored query, no rank fusion: the lexical clauses sum inside their
    // own bool, and the semantic fallback competes with that sum via dis_max
    // (score = max) — see buildSemanticFallbackQuery for why neither RRF nor
    // an additive clause works. Filters wrap the dis_max so both sides stay
    // scoped identically.
    // The gate sits in filter context (it decides eligibility, never score);
    // the tiered should-clauses carry all of the scoring. minimum_should_match
    // stays 1 so a document that somehow clears the gate without any scoring
    // clause cannot enter at score 0.
    const lexicalBool: estypes.QueryDslQueryContainer = {
        bool: {
            filter: [buildCoverageGate(queryText)],
            should: buildLexicalShouldClauses(queryText, extractedFilters),
            minimum_should_match: 1
        }
    };
    const textCore: estypes.QueryDslQueryContainer = {
        bool: {
            must: [
                request.config?.enableSemanticSearch
                    ? {
                        dis_max: {
                            queries: [
                                lexicalBool,
                                buildSemanticFallbackQuery(
                                    queryText,
                                    request.config.semanticMinScore ?? DEFAULT_SEMANTIC_MIN_SCORE
                                )
                            ],
                            // Pure max: any tie_breaker share of the semantic score
                            // added onto near-tied strong lexical matches would
                            // reorder them (their gaps measure ~2%).
                            tie_breaker: 0
                        }
                    }
                    : lexicalBool
            ],
            filter: filters
        }
    };
    // Proximity lifts pinned subjects near the extracted location. The text core
    // stays in `must`, so a location-only match without any text match cannot
    // surface. constant_score awards LOCATION_BOOST once for being near the
    // place: the geo clauses sit in ITS filter context, where the number of
    // points the geocoder returned for one place cannot reach the score.
    const locationClause = buildLocationClause(request.locations);
    const scoredQuery: estypes.QueryDslQueryContainer = locationClause
        ? {
            bool: {
                must: [textCore],
                should: [{ constant_score: { filter: locationClause, boost: LOCATION_BOOST } }]
            }
        }
        : textCore;

    return {
        index: env.ELASTICSEARCH_INDEX,
        size: request.config?.size || 10,
        from: request.config?.from || 0,
        track_total_hits: true,
        query: applyRanking(scoredQuery),
        // Request highlight fragments so the UI can emphasize the matched terms.
        // number_of_fragments:0 returns the whole field (with markers) as a single
        // fragment, keeping titles/descriptions intact rather than snippeted.
        ...(request.config?.enableHighlights ? {
            highlight: {
                pre_tags: [HIGHLIGHT_START],
                post_tags: [HIGHLIGHT_END],
                number_of_fragments: 0,
                fields: {
                    name: {},
                    description: {}
                }
            }
        } : {})
    };
}
