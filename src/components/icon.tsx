'use client';

import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import type { LucideIcon } from 'lucide-react';
import { Facebook, Github, Instagram, Linkedin, Twitter, Youtube } from '@/components/brandIcons';

// lucide-react 1.0 removed its brand icons. A topic or a city message in the
// database can still name one of these.
const brandIcons = new Map<string, LucideIcon>([
    ['facebook', Facebook],
    ['github', Github],
    ['instagram', Instagram],
    ['linkedin', Linkedin],
    ['twitter', Twitter],
    ['youtube', Youtube],
]);

const lucideNames = new Set<string>(iconNames);

/** kebab-case icon names from lucide (e.g. "badge-check", "building") */
export const ICON_NAMES: string[] = [...lucideNames, ...brandIcons.keys()].sort();

function isLucideName(name: string): name is IconName {
    return lucideNames.has(name);
}

/**
 * Renders a Lucide icon by kebab-case name (e.g. "badge-check", "building").
 */
const Icon = ({ name, color, size }: { name: string; color: string; size: number }) => {
    const BrandIcon = brandIcons.get(name);
    if (BrandIcon) return <BrandIcon color={color} size={size} />;
    if (!isLucideName(name)) return null;

    return <DynamicIcon name={name} color={color} size={size} />;
};

export default Icon;
