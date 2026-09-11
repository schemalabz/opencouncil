import { selectExcerptRuns, type ExcerptSource, type ExcerptRun } from './excerptSelector';

export interface CapturedExcerpt {
    firstUtteranceId: string;
    lastUtteranceId: string;
    runs: ExcerptRun[];
    startTimestamp: number;
    rect: { top: number; bottom: number; left: number; right: number };
}
export type SelectionResult = { status: 'ok'; selection: CapturedExcerpt } | { status: 'empty' | 'invalid' | 'too-long' };

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
    const runs = selectExcerptRuns(sourceRange);
    if (!runs) return { status: 'too-long' };
    const rect = range && !fullUtteranceId ? range.getBoundingClientRect() : first.element.getBoundingClientRect();
    return { status: 'ok', selection: {
        firstUtteranceId: first.source.id, lastUtteranceId: last.source.id,
        runs, startTimestamp: first.source.startTimestamp,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    } };
}
