import { localePath, validSourceId, type QueryParams } from './excerptSelector';

export const SUBJECT_EMBED_HEIGHT = 420;
export type SubjectEmbedMode = 'light' | 'dark';
export interface SubjectEmbedTarget { cityId: string; meetingId: string; subjectId: string }

export function parseSubjectEmbedTarget(query: QueryParams): SubjectEmbedTarget | null {
    const { cityId, meetingId, subjectId } = query;
    return validSourceId(cityId) && validSourceId(meetingId) && validSourceId(subjectId) ? { cityId, meetingId, subjectId } : null;
}

export function subjectEmbedUrl(origin: string, locale: string, target: SubjectEmbedTarget, mode: SubjectEmbedMode): string {
    const url = new URL(localePath(locale, '/embed/subject'), origin);
    url.search = new URLSearchParams({ ...target, mode }).toString();
    return url.href;
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

export function subjectEmbedSnippet(url: string, title: string): string {
    return `<iframe src="${escapeAttribute(url)}" title="${escapeAttribute(title)}" width="100%" height="${SUBJECT_EMBED_HEIGHT}" style="border:0;" loading="lazy"></iframe>`;
}
