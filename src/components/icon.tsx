'use client';

import dynamicIconImports from 'lucide-react/dynamicIconImports';
import dynamic from 'next/dynamic';

/** kebab-case icon names from lucide (e.g. "badge-check", "building") */
export const ICON_NAMES: string[] = Object.keys(dynamicIconImports).sort();

const validNames = new Set(ICON_NAMES);

// Cache so we only call dynamic() once per icon name
const dynamicCache = new Map<string, React.ComponentType<{ color?: string; size?: number }>>();

function getDynamicIcon(name: string) {
    if (!validNames.has(name)) return null;

    let component = dynamicCache.get(name);
    if (!component) {
        // Direct path import — avoids Turbopack HMR bug with dynamicIconImports' import() expressions
        component = dynamic(
            () => import(`lucide-react/dist/esm/icons/${name}.js`),
            { ssr: false }
        );
        dynamicCache.set(name, component);
    }
    return component;
}

/**
 * Renders a Lucide icon by kebab-case name (e.g. "badge-check", "building").
 */
const Icon = ({ name, color, size }: { name: string; color: string; size: number }) => {
    const DynamicIcon = getDynamicIcon(name);
    if (!DynamicIcon) return null;

    return <DynamicIcon color={color} size={size} />;
};

export default Icon;
