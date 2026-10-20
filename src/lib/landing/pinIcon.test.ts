/** @jest-environment jsdom */
import { createPinIcon, loadPinIconNode } from './pinIcon';
import { dynamicIconImports } from 'lucide-react/dynamic';

// lucide-react/dynamic is ESM-only; a small map in its shape, with the data each lazy module exports.
jest.mock('lucide-react/dynamic', () => {
    const lazyModule = (node: unknown) => jest.fn(async () => ({ __iconData: { name: 'x', size: 24, node } }));
    return {
        dynamicIconImports: {
            leaf: lazyModule([['path', { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2', key: 'nnexq3' }]]),
            'paw-print': lazyModule([['circle', { cx: '11', cy: '4', r: '2', key: 'vol9p0' }]]),
            bus: lazyModule([['path', { d: 'M8 6v6', key: '18i7km' }]]),
            hash: lazyModule([['line', { x1: '4', x2: '20', y1: '9', y2: '9', key: '4lhtct' }]]),
        },
    };
});

const imports = dynamicIconImports as unknown as Record<string, jest.Mock>;

describe('loadPinIconNode', () => {
    it('loads the node of a kebab-case lucide name through its lazy module', async () => {
        const node = await loadPinIconNode('paw-print');
        expect(node).toEqual([['circle', { cx: '11', cy: '4', r: '2', key: 'vol9p0' }]]);
    });

    it('loads each icon once, however many pins ask for it', async () => {
        await Promise.all([loadPinIconNode('leaf'), loadPinIconNode('leaf'), loadPinIconNode('leaf')]);
        expect(imports.leaf).toHaveBeenCalledTimes(1);
    });

    it('falls back to the hash glyph for a missing, unknown or brand name', async () => {
        const hash = await loadPinIconNode('hash');
        expect(await loadPinIconNode(null)).toBe(hash);
        expect(await loadPinIconNode('no-such-icon')).toBe(hash);
        expect(await loadPinIconNode('youtube')).toBe(hash);
        // a name on Object.prototype is not an icon either
        expect(await loadPinIconNode('constructor')).toBe(hash);
    });
});

describe('loadPinIconNode after a failed load', () => {
    // an icon no earlier test loaded, so the first request really reaches the module
    it('forgets a chunk that failed, so the next pin asks again', async () => {
        imports.bus.mockRejectedValueOnce(new Error('offline'));
        await expect(loadPinIconNode('bus')).rejects.toThrow('offline');
        expect(await loadPinIconNode('bus')).toEqual([['path', { d: 'M8 6v6', key: '18i7km' }]]);
        expect(imports.bus).toHaveBeenCalledTimes(2);
    });
});

describe('createPinIcon', () => {
    it('builds an SVG sized for the pin whose stroke follows the pin colour', () => {
        const svg = createPinIcon([['path', { d: 'M1 1', key: 'k' }], ['circle', { cx: '1', cy: '2', r: '3', key: 'c' }]], 14);
        expect(svg.tagName.toLowerCase()).toBe('svg');
        expect(svg.getAttribute('width')).toBe('14');
        expect(svg.getAttribute('height')).toBe('14');
        expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.querySelector('path')?.getAttribute('d')).toBe('M1 1');
        expect(svg.querySelector('circle')?.getAttribute('r')).toBe('3');
        // React's reconciliation key is not an SVG attribute
        expect(svg.querySelector('[key]')).toBeNull();
    });
});
