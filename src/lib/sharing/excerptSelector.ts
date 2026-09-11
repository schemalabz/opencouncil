import { LOCALES, type AppLocale, urlPrefixForLocale } from '@/i18n/config';

export const MAX_EXCERPT_LENGTH = 20_000;
export const MAX_EXCERPT_UTTERANCES = 40;
export type QueryParams = Record<string, string | string[] | undefined>;
export interface ExcerptSelector {
    cityId: string;
    meetingId: string;
    firstUtteranceId: string;
    lastUtteranceId: string;
    textLocale: AppLocale;
    digest: string;
}
export interface ExcerptRun {
    id: string;
    text: string;
    speakerTagId: string;
    personId: string | null;
    speakerName: string | null;
}
export interface ExcerptSource extends ExcerptRun { startTimestamp: number }

const keys = ['cityId', 'meetingId', 'firstUtteranceId', 'lastUtteranceId', 'textLocale', 'digest'] as const;
export const validSourceId = (value: unknown): value is string => typeof value === 'string' && /^[\p{L}\p{N}_-]{1,160}$/u.test(value);

export function parseExcerptSelector(input: URLSearchParams | QueryParams): ExcerptSelector | null {
    // Old partial-quote URLs must not silently expand to different words.
    if (['startOffset', 'endOffset'].some(key => input instanceof URLSearchParams ? input.has(key) : Object.hasOwn(input, key))) return null;
    const values = Object.fromEntries(keys.map(key => [key, input instanceof URLSearchParams ? (input.getAll(key).length === 1 ? input.get(key) : undefined) : input[key]]));
    if (!keys.every(key => typeof values[key] === 'string')) return null;
    if (!['cityId', 'meetingId', 'firstUtteranceId', 'lastUtteranceId'].every(key => validSourceId(values[key]))) return null;
    if (!LOCALES.includes(values.textLocale as AppLocale) || !/^[a-f0-9]{64}$/.test(values.digest as string)) return null;
    return values as unknown as ExcerptSelector;
}

export function serializeExcerptSelector(selector: ExcerptSelector): URLSearchParams {
    return new URLSearchParams(keys.map(key => [key, String(selector[key])]));
}

export const localePath = (locale: string, path: string) => `/${urlPrefixForLocale(locale)}${path}`;
export const excerptPath = (selector: ExcerptSelector, uiLocale: string = selector.textLocale) => `${localePath(uiLocale, '/share/excerpt')}?${serializeExcerptSelector(selector)}`;
export function transcriptExcerptPath(selector: ExcerptSelector, timestamp: number) {
    const query = serializeExcerptSelector(selector);
    query.set('t', String(Math.floor(timestamp)));
    return `${localePath(selector.textLocale, `/${selector.cityId}/${selector.meetingId}/transcript`)}?${query}`;
}

export function selectExcerptRuns(sources: ExcerptRun[]): ExcerptRun[] | null {
    if (!sources.length || sources.length > MAX_EXCERPT_UTTERANCES) return null;
    const text = sources.map(source => source.text).join(' ');
    return text.trim() && text.length <= MAX_EXCERPT_LENGTH ? sources.map(source => ({ ...source })) : null;
}

// Explicit fields keep the browser and server digest identical even when a source
// model contains additional presentation fields. Versioning leaves room for migrations.
export function canonicalExcerpt(runs: ExcerptRun[]): string {
    return JSON.stringify([2, runs.map(run => [run.id, run.text, run.speakerTagId, run.personId, run.speakerName])]);
}

export async function digestExcerpt(runs: ExcerptRun[]): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalExcerpt(runs)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function truncatePreview(text: string, limit: number): string {
    const characters = Array.from(text);
    return characters.length <= limit ? text : `${characters.slice(0, limit - 1).join('').trimEnd()}…`;
}
