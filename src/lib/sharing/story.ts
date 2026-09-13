import { serializeExcerptSelector, type ExcerptSelector } from './excerptSelector';

export type StoryTarget =
    | { type: 'excerpt'; selector: ExcerptSelector }
    | { type: 'contribution'; id: string; locale: string }
    | { type: 'subject'; cityId: string; meetingId: string; subjectId: string; locale: string };

export function storyImagePath(target: StoryTarget) {
    const query = target.type === 'excerpt'
        ? serializeExcerptSelector(target.selector)
        : new URLSearchParams(Object.entries(target));
    query.set('type', target.type);
    return `/api/share/story?${query}`;
}

// Bound the layout before Satori receives it. A Story previews the source;
// truncating the image never changes the complete utterances in its link.
export function storyPreview(text: string, limit: number) {
    const clean = text.replace(/\s+/g, ' ').trim();
    const characters = Array.from(clean);
    if (characters.length <= limit) return clean;
    const candidate = characters.slice(0, limit - 1).join('');
    const breakAt = candidate.lastIndexOf(' ');
    return `${breakAt > candidate.length * 0.7 ? candidate.slice(0, breakAt) : candidate}…`;
}

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
