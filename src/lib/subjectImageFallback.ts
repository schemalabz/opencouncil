import { icons } from 'lucide';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '@opencouncil/subject-images/constants';
import { topicStyleHex } from '@/lib/topicStyle';

/**
 * The placeholder a subject shows until it has an image: a flat wash of its
 * topic colour with the topic icon in the middle, at the same 1344×768 as the
 * real image so nothing shifts when it arrives. Built as a string, not with
 * React, so the read route stays free of react-dom/server.
 */

const ICON_SIZE = 192;

/** lucide names icons `badge-check` in the app and `BadgeCheck` in its data. */
function toPascalCase(kebab: string): string {
    return kebab.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function escapeAttribute(value: unknown): string {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function iconMarkup(name: string | null | undefined, color: string): string {
    const node = (name && icons[toPascalCase(name) as keyof typeof icons]) || icons.Hash;
    const [, , children = []] = node;
    const x = (IMAGE_WIDTH - ICON_SIZE) / 2;
    const y = (IMAGE_HEIGHT - ICON_SIZE) / 2;
    const shapes = children
        .map(([tag, attrs]) => {
            const attributes = Object.entries(attrs)
                .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
                .join(' ');
            return `<${tag} ${attributes}/>`;
        })
        .join('');
    return `<svg x="${x}" y="${y}" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}

export function subjectImageFallbackSvg(topic: { colorHex?: string | null; icon?: string | null } | null): string {
    const style = topicStyleHex(topic?.colorHex);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">`
        + `<rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="${style.background}"/>`
        + iconMarkup(topic?.icon, style.icon)
        + '</svg>';
}
