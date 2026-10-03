import { createElement, type CSSProperties, type ReactNode } from 'react';
import { icons, type IconNode } from 'lucide';

/** `building-2` -> `Building2`, the key lucide's icon map uses. */
function pascal(name: string): string {
    return name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * A lucide glyph as plain SVG, with the attributes that lucide-react draws.
 * satori calls a component without React's hooks, and a lucide-react 1.x icon
 * reads a React context, so the image renderer takes the icon data of the
 * framework-free `lucide` package instead.
 */
export function OgIcon({ node, size, color, strokeWidth = 2, style }: { node: IconNode; size: number; color: string; strokeWidth?: number; style?: CSSProperties }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={style}
        >
            {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
        </svg>
    );
}

/**
 * A topic's glyph for the image renderer: lucide's SVG, drawn by the same
 * name the pages use. The pages resolve it lazily in the browser
 * (`@/components/icon`); satori gets the SVG itself, since it renders
 * inline SVG and cannot load anything later.
 */
export function topicGlyph(name: string | null | undefined, size: number, color: string): ReactNode {
    const node = (name && icons[pascal(name) as keyof typeof icons]) || icons.Hash;
    return <OgIcon node={node} size={size} color={color} />;
}
