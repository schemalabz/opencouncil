import { captureExcerptSelection, captureExcerptSegment } from '../selection';
import { MAX_EXCERPT_LENGTH, MAX_EXCERPT_UTTERANCES, excerptSourceIsVisible, type ExcerptSource } from '../excerptSelector';

const sources: ExcerptSource[] = [
    { id: 'u1', text: 'Η πλατεία 🌳', speakerTagId: 'a', personId: 'anna', speakerName: 'Άννα', startTimestamp: 0 },
    { id: 'u2', text: 'Συμφωνώ.', speakerTagId: 'b', personId: null, speakerName: null, startTimestamp: 10 },
];

function fixture() {
    const root = document.createElement('div');
    root.innerHTML = '<h2>Speaker one</h2><span data-utterance-id="u1">Η <mark>πλατεία</mark> 🌳 </span><button>Play</button><h2>Speaker two</h2><span data-utterance-id="u2">Συμφωνώ. </span>';
    document.body.appendChild(root);
    return root;
}

describe('native transcript selection', () => {
    beforeAll(() => { Range.prototype.getBoundingClientRect = () => ({ top: 1, bottom: 2, left: 3, right: 4, width: 1, height: 1, x: 3, y: 1, toJSON: () => ({}) }); });
    afterEach(() => { document.body.innerHTML = ''; });

    it('captures multiple text nodes and speakers without copying controls or headings', () => {
        const root = fixture(); const range = document.createRange();
        range.setStart(root.querySelector('mark')!.firstChild!, 1);
        range.setEnd(root.querySelector('[data-utterance-id="u2"]')!.firstChild!, 4);
        const result = captureExcerptSelection(root, range, sources);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') throw new Error('Expected a source selection');
        expect(result.selection.runs.map(run => run.text)).toEqual(sources.map(source => source.text));
        expect(result.selection).not.toHaveProperty('startOffset');
        expect(result.selection).not.toHaveProperty('endOffset');
        expect(result.selection.runs[1].speakerName).toBeNull();
        expect(result.selection.startTimestamp).toBe(0);
    });

    it('normalizes element boundaries and excludes synthetic trailing separators', () => {
        const root = fixture(); const range = document.createRange();
        range.selectNodeContents(root);
        const result = captureExcerptSelection(root, range, sources);
        expect(result.status === 'ok' && result.selection.runs.map(run => run.text)).toEqual(sources.map(source => source.text));
    });

    it('uses an ordered browser Range for a backward anchor/focus selection', () => {
        const root = fixture();
        const selection = window.getSelection()!;
        selection.setBaseAndExtent(root.querySelector('[data-utterance-id="u2"]')!.firstChild!, 4, root.querySelector('mark')!.firstChild!, 1);
        expect(selection.anchorNode).not.toBe(selection.getRangeAt(0).startContainer);
        const result = captureExcerptSelection(root, selection.getRangeAt(0), sources);
        expect(result.status === 'ok' && result.selection.firstUtteranceId).toBe('u1');
    });

    it('rejects DOM drift, outside selection, omitted utterances and oversize selections', () => {
        const root = fixture(); const range = document.createRange(); range.selectNodeContents(root);
        expect(captureExcerptSelection(root, range, [...sources.slice(0, 1), { ...sources[0], id: 'missing' }, sources[1]]).status).toBe('invalid');
        root.querySelector('mark')!.textContent = 'changed';
        expect(captureExcerptSelection(root, range, sources).status).toBe('invalid');
        range.selectNodeContents(document.body);
        expect(captureExcerptSelection(root, range, sources).status).toBe('invalid');
    });

    it('expands partial text but excludes a zero-length intersection and synthetic space', () => {
        const root = fixture(); const range = document.createRange();
        range.setStart(root.querySelector('mark')!.firstChild!, 2);
        range.setEnd(root.querySelector('[data-utterance-id="u2"]')!.firstChild!, 0);
        const result = captureExcerptSelection(root, range, sources);
        expect(result.status === 'ok' && result.selection.runs.map(run => run.text)).toEqual([sources[0].text]);
        const first = root.querySelector('[data-utterance-id="u1"]')!;
        range.setStart(first.lastChild!, first.lastChild!.textContent!.length - 1);
        range.setEnd(first.lastChild!, first.lastChild!.textContent!.length);
        expect(captureExcerptSelection(root, range, sources).status).toBe('empty');
    });

    it('shares the saved full utterance from edit-mode context menus', () => {
        const result = captureExcerptSelection(fixture(), null, sources, 'u1');
        expect(result.status === 'ok' && result.selection.runs[0].text).toBe(sources[0].text);
    });
    it('captures a continuous visible passage across a drift-hidden utterance', () => {
        const root = fixture(); const range = document.createRange(); range.selectNodeContents(root);
        const rawSources = [sources[0], { ...sources[0], id: 'hidden', drift: 600 }, sources[1]];
        const visible = rawSources.filter(source => excerptSourceIsVisible(source, 500));
        expect(captureExcerptSelection(root, range, visible)).toMatchObject({ status: 'ok', selection: { runs: sources } });
        expect(captureExcerptSegment(root, visible, ['u1', 'u2'])).toMatchObject({ status: 'ok', selection: { runs: sources } });
    });

    it('captures the complete requested turn, without neighboring text or controls', () => {
        const root = fixture();
        const result = captureExcerptSegment(root, sources, ['u2']);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') throw new Error('Expected a complete segment');
        expect(result.selection).toMatchObject({ firstUtteranceId: 'u2', lastUtteranceId: 'u2', startTimestamp: 10, runs: [sources[1]] });
        expect(captureExcerptSegment(root, sources, ['u1', 'u2'])).toMatchObject({ status: 'ok', selection: { runs: sources } });
    });

    it('rejects hidden passages, unsaved editors and non-contiguous segment IDs instead of shortening the turn', () => {
        const root = fixture();
        expect(captureExcerptSegment(root, sources, ['u2', 'u1']).status).toBe('invalid');
        expect(captureExcerptSegment(root, [...sources.slice(0, 1), { ...sources[0], id: 'omitted' }, sources[1]], ['u1', 'u2']).status).toBe('invalid');
        root.querySelector('[data-utterance-id="u2"]')!.remove();
        expect(captureExcerptSegment(root, sources, ['u1', 'u2']).status).toBe('invalid');
        root.querySelector('mark')!.textContent = 'Unsaved edit';
        expect(captureExcerptSegment(root, sources, ['u1']).status).toBe('invalid');
    });

    it.each(['length', 'count'])('rejects segments exceeding the %s limit without truncation', limit => {
        const segment = Array.from({ length: limit === 'count' ? MAX_EXCERPT_UTTERANCES + 1 : 1 }, (_, index) => ({
            ...sources[0], id: `u${index}`, text: limit === 'length' ? 'a'.repeat(MAX_EXCERPT_LENGTH + 1) : 'Saved text.',
        }));
        const root = document.createElement('div');
        segment.forEach(source => {
            const span = document.createElement('span');
            span.dataset.utteranceId = source.id;
            span.textContent = source.text;
            root.appendChild(span);
        });
        expect(captureExcerptSegment(root, segment, segment.map(source => source.id)).status).toBe('too-long');
    });
});
