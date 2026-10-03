/**
 * @jest-environment node
 */
import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { topicGlyph } from '../topicIcon';

type Render = (props: object, ref: null) => ReactNode;

/**
 * Expands a tree the way satori does: it calls each component itself, outside
 * React's renderer. A component that uses a hook throws here, as in satori.
 */
function expandLikeSatori(node: ReactNode): ReactNode {
    if (!isValidElement<{ children?: ReactNode }>(node)) return node;
    const type: unknown = node.type;
    if (typeof type === 'function') return expandLikeSatori((type as Render)(node.props, null));
    if (typeof type === 'object' && type !== null && 'render' in type) return expandLikeSatori((type.render as Render)(node.props, null));
    return cloneElement(node, undefined, Children.map(node.props.children, expandLikeSatori));
}

const drawn = (name: string | null) => renderToStaticMarkup(expandLikeSatori(topicGlyph(name, 32, '#123456')));

describe('topicGlyph', () => {
    it('draws a topic glyph without React hooks, as satori needs', () => {
        const svg = drawn('building-2');
        expect(svg).toMatch(/^<svg [^>]*width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#123456" stroke-width="2"/);
        expect(svg).toContain('<path d=');
    });

    it('falls back to the hash glyph for an unknown or empty name', () => {
        expect(drawn('no-such-icon')).toBe(drawn('hash'));
        expect(drawn(null)).toBe(drawn('hash'));
        expect(drawn('building-2')).not.toBe(drawn('hash'));
    });
});
