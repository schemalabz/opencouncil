import { dynamicIconImports, type IconName } from 'lucide-react/dynamic';
import type { IconNode } from 'lucide-react';

/** What a pin shows for a topic without an icon, or with a name lucide has no icon for. */
const FALLBACK_ICON: IconName = 'hash';

/** Icon nodes loaded so far, by name — one chunk per icon ever drawn, shared by every pin of it. */
const nodes = new Map<IconName, Promise<IconNode>>();

function isIconName(name: string): name is IconName {
    return Object.hasOwn(dynamicIconImports, name);
}

/**
 * The icon node of a lucide icon, by the kebab-case name a topic carries, through the per-icon
 * lazy chunks lucide-react/dynamic already ships for the Icon component. The vanilla `lucide`
 * map would put every icon in the client bundle, since the name is only known at runtime
 * (measured: 101 KB gzipped on the landing page). A name lucide does not know — a brand name
 * among them, which only the Icon component can draw — resolves to the fallback.
 */
export function loadPinIconNode(name: string | null | undefined): Promise<IconNode> {
    const key = name && isIconName(name) ? name : FALLBACK_ICON;
    let node = nodes.get(key);
    if (!node) {
        node = dynamicIconImports[key]()
            .then((mod) => (mod as { __iconData?: { node?: IconNode } }).__iconData?.node ?? [])
            .catch((error: unknown) => {
                // A chunk that failed to load (a dropped connection) must not fail every later
                // pin of this icon: forget it, so the next pin asks again.
                nodes.delete(key);
                throw error;
            });
        nodes.set(key, node);
    }
    return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An icon node as a plain SVG element, with the attributes lucide-react draws: a 24-unit box, no
 * fill, a 2-unit currentColor stroke with round caps and joins, hidden from assistive technology.
 * A pin must not own a React root for its icon: every pin of a crowded viewport morphs from a dot
 * to a badge at once, and hundreds of roots mounting in one frame stalled the zoom. The stroke is
 * currentColor, so the pin's `el.style.color` drives it as it did the component.
 */
export function createPinIcon(node: IconNode, size: number): SVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs: Record<string, string> = {
        xmlns: SVG_NS,
        width: String(size),
        height: String(size),
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
    };
    for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
    for (const [tag, props] of node) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(props)) {
            if (key !== 'key' && value != null) el.setAttribute(key, String(value));
        }
        svg.appendChild(el);
    }
    return svg;
}
