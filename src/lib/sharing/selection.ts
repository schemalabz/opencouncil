import { selectExcerptRuns, type ExcerptSource, type ExcerptRun } from './excerptSelector';

export interface CapturedExcerpt {
    firstUtteranceId: string;
    lastUtteranceId: string;
    runs: ExcerptRun[];
    startTimestamp: number;
    rect: { top: number; bottom: number; left: number; right: number };
}
export type SelectionResult = { status: 'ok'; selection: CapturedExcerpt } | { status: 'empty' | 'invalid' | 'too-long' };

function captureSources(sources: ExcerptSource[], rect: DOMRect): SelectionResult {
    const runs = selectExcerptRuns(sources);
    if (!runs) return { status: 'too-long' };
    return { status: 'ok', selection: {
        firstUtteranceId: sources[0].id, lastUtteranceId: sources[sources.length - 1].id,
        runs, startTimestamp: sources[0].startTimestamp,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    } };
}

// Use explicit IDs because a displayed speaker turn can join several stored
// segments. Never silently drop a hidden passage or an editor's unsaved text.
export function captureExcerptSegment(root: HTMLElement, sources: ExcerptSource[], utteranceIds: string[]): SelectionResult {
    if (!utteranceIds.length) return { status: 'empty' };
    const firstIndex = sources.findIndex(source => source.id === utteranceIds[0]);
    const sourceRange = sources.slice(firstIndex, firstIndex + utteranceIds.length);
    if (firstIndex < 0 || sourceRange.length !== utteranceIds.length || sourceRange.some((source, index) => source.id !== utteranceIds[index])) return { status: 'invalid' };
    const elements = new Map(Array.from(root.querySelectorAll<HTMLElement>('[data-utterance-id]')).map(element => [element.dataset.utteranceId, element]));
    for (const source of sourceRange) {
        const element = elements.get(source.id);
        if (!element || (element.textContent !== source.text && element.textContent !== source.text + ' ')) return { status: 'invalid' };
    }
    return captureSources(sourceRange, elements.get(utteranceIds[0])!.getBoundingClientRect());
}

export function captureExcerptSelection(root: HTMLElement, range: Range | null, sources: ExcerptSource[], fullUtteranceId?: string): SelectionResult {
    const sourceMap = new Map(sources.map(source => [source.id, source]));
    if (!fullUtteranceId && (!range || range.collapsed)) return { status: 'empty' };
    if (!fullUtteranceId && range && (!root.contains(range.startContainer) || !root.contains(range.endContainer))) return { status: 'invalid' };
    const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-utterance-id]'));
    const selected: { element: HTMLElement; source: ExcerptSource }[] = [];
    for (const element of elements) {
        if (fullUtteranceId ? element.dataset.utteranceId !== fullUtteranceId : !range?.intersectsNode(element)) continue;
        const source = sourceMap.get(element.dataset.utteranceId ?? '');
        if (!source || (element.textContent !== source.text + ' ' && element.textContent !== source.text)) return { status: 'invalid' };
        let start = 0;
        let end = source.text.length;
        if (!fullUtteranceId && range) {
            const prefix = document.createRange();
            prefix.selectNodeContents(element);
            if (element.contains(range.startContainer)) {
                prefix.setEnd(range.startContainer, range.startOffset);
                start = Math.min(source.text.length, prefix.toString().length);
            }
            if (element.contains(range.endContainer)) {
                prefix.selectNodeContents(element);
                prefix.setEnd(range.endContainer, range.endOffset);
                end = Math.min(source.text.length, prefix.toString().length);
            }
        }
        if (end > start) selected.push({ element, source });
    }
    if (!selected.length) return { status: 'empty' };
    const first = selected[0];
    const last = selected[selected.length - 1];
    const firstIndex = sources.findIndex(source => source.id === first.source.id);
    const lastIndex = sources.findIndex(source => source.id === last.source.id);
    const sourceRange = sources.slice(firstIndex, lastIndex + 1);
    if (sourceRange.length !== selected.length || sourceRange.some((source, index) => source.id !== selected[index].source.id)) return { status: 'invalid' };
    const rect = range && !fullUtteranceId ? range.getBoundingClientRect() : first.element.getBoundingClientRect();
    return captureSources(sourceRange, rect);
}
