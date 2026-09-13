import type { ReactNode } from 'react';
import { icons } from 'lucide-react';

/** `building-2` -> `Building2`, the key lucide's icon map uses. */
function pascal(name: string): string {
    return name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * A topic's glyph for the image renderer: lucide's SVG, drawn by the same
 * name the pages use. The pages resolve it lazily in the browser
 * (`@/components/icon`); satori gets the component itself, since it renders
 * inline SVG and cannot load anything later.
 */
export function topicGlyph(name: string | null | undefined, size: number, color: string): ReactNode {
    const Glyph = (name && icons[pascal(name) as keyof typeof icons]) || icons.Hash;
    return <Glyph size={size} color={color} strokeWidth={2} />;
}
