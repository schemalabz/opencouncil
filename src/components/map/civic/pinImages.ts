import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type mapboxgl from 'mapbox-gl';
import { ICON_NAMES } from '@/components/icon';
import { FALLBACK_TOPIC_COLOR, FALLBACK_TOPIC_ICON } from '@/lib/map/constants';

/**
 * Rasterizes per-topic pin badges (topic-colored disc, white lucide icon,
 * white ring, soft shadow) into mapbox images, so subject pins render on the
 * GPU as symbol layers. One image per topic; size tiers come from icon-size
 * expressions. Registered at pixelRatio 2 → 32px logical base size.
 */

export const PIN_IMAGE_PREFIX = 'civic-pin-';
const PIN_IMAGE_SIZE = 64;

export interface PinTopic {
    id: string | null;
    colorHex: string;
    icon: string | null;
}

export function pinImageId(topicId: string | null): string {
    return `${PIN_IMAGE_PREFIX}${topicId ?? 'fallback'}`;
}

const VALID_ICON_NAMES = new Set(ICON_NAMES);

type LucideModule = { default: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> };

async function renderIconMarkup(iconName: string): Promise<string | null> {
    const mod = (await import(`lucide-react/dist/esm/icons/${iconName}.js`)) as LucideModule;
    const host = document.createElement('div');
    const root = createRoot(host);
    // Runs in a microtask after an awaited import — never inside React's
    // own render/commit, which is what flushSync forbids.
    flushSync(() => {
        root.render(createElement(mod.default, { color: '#ffffff', size: 32, strokeWidth: 2.5 }));
    });
    const markup = host.innerHTML;
    root.unmount();
    return markup || null;
}

function composeBadgeSvg(colorHex: string, iconMarkup: string): string {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_IMAGE_SIZE}" height="${PIN_IMAGE_SIZE}" viewBox="0 0 64 64">` +
        `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">` +
        `<feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.28"/>` +
        `</filter></defs>` +
        `<circle cx="32" cy="32" r="25" fill="${colorHex}" stroke="#ffffff" stroke-width="4" filter="url(#shadow)"/>` +
        `<g transform="translate(16 16)">${iconMarkup}</g>` +
        `</svg>`
    );
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image(PIN_IMAGE_SIZE, PIN_IMAGE_SIZE);
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('pin svg failed to rasterize'));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
}

/** Plain colored disc — the failure-proof fallback so a bad icon never breaks the layer. */
function fallbackDisc(colorHex: string): ImageData | null {
    const canvas = document.createElement('canvas');
    canvas.width = PIN_IMAGE_SIZE;
    canvas.height = PIN_IMAGE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.fillStyle = colorHex;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    return ctx.getImageData(0, 0, PIN_IMAGE_SIZE, PIN_IMAGE_SIZE);
}

// One rasterization per (map, topic) — keyed weakly so a removed map frees its jobs.
const jobsByMap = new WeakMap<mapboxgl.Map, Map<string, Promise<void>>>();

export function ensurePinImage(map: mapboxgl.Map, topic: PinTopic): Promise<void> {
    const imageId = pinImageId(topic.id);
    if (map.hasImage(imageId)) return Promise.resolve();

    let jobs = jobsByMap.get(map);
    if (!jobs) {
        jobs = new Map();
        jobsByMap.set(map, jobs);
    }
    const existing = jobs.get(imageId);
    if (existing) return existing;

    const colorHex = topic.colorHex || FALLBACK_TOPIC_COLOR;
    const iconName = topic.icon && VALID_ICON_NAMES.has(topic.icon) ? topic.icon : FALLBACK_TOPIC_ICON;

    const job = (async () => {
        try {
            const markup = await renderIconMarkup(iconName);
            if (!markup) throw new Error(`no markup for icon ${iconName}`);
            const image = await svgToImage(composeBadgeSvg(colorHex, markup));
            if (!map.hasImage(imageId) && map.getStyle()) {
                map.addImage(imageId, image, { pixelRatio: 2 });
            }
        } catch (error) {
            console.warn(`[civic-map] pin image fallback for topic ${topic.id}:`, error);
            const disc = fallbackDisc(colorHex);
            if (disc && !map.hasImage(imageId) && map.getStyle()) {
                map.addImage(imageId, disc, { pixelRatio: 2 });
            }
        } finally {
            jobs?.delete(imageId);
        }
    })();
    jobs.set(imageId, job);
    return job;
}

export function ensurePinImages(map: mapboxgl.Map, topics: PinTopic[]): Promise<void> {
    const jobs = [
        ensurePinImage(map, { id: null, colorHex: FALLBACK_TOPIC_COLOR, icon: FALLBACK_TOPIC_ICON }),
        ...topics.map(topic => ensurePinImage(map, topic)),
    ];
    return Promise.all(jobs).then(() => undefined);
}
