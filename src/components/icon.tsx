'use client';

import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import type { IconType } from 'react-icons';
import { SiFacebook, SiGithub, SiInstagram, SiX, SiYoutube } from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';

// lucide-react 1.0 removed its brand icons. A topic or a city message in the
// database can still name one of these.
// Simple Icons has no LinkedIn logo, so that one comes from Font Awesome.
const brandIcons = new Map<string, IconType>([
    ['facebook', SiFacebook],
    ['github', SiGithub],
    ['instagram', SiInstagram],
    ['linkedin', FaLinkedin],
    ['twitter', SiX],
    ['youtube', SiYoutube],
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
    if (BrandIcon) return <BrandIcon color={color} size={size} aria-hidden />;
    if (!isLucideName(name)) return null;

    return <DynamicIcon name={name} color={color} size={size} />;
};

export default Icon;
