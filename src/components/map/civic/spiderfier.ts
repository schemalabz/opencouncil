import mapboxgl from 'mapbox-gl';
import { SPIDERFY_BADGE_SIZE_PX } from '@/lib/map/constants';
import { spiderfyExtent, spiderfyPositions } from '@/lib/map/spiderfy';
import type { MapSubject } from '@/lib/map/types';
import { createPinBadgeSvg } from './pinImages';

/**
 * Fans co-located subjects out around their shared location: a center dot
 * pinpoints the true spot, legs connect it to one clickable badge per
 * subject. Rendered as a single DOM marker so the whole fan pans with the
 * map.
 */

const INK = '#0c0a09';
const LEG_COLOR = 'rgba(28, 25, 23, 0.45)';

export interface SpiderfierOptions {
    onSelect: (subject: MapSubject) => void;
    onHover?: (subjectId: string | null) => void;
    reducedMotion: boolean;
}

export interface Spiderfier {
    open(subjects: MapSubject[], anchor: [number, number]): void;
    close(): void;
    isOpen(): boolean;
    destroy(): void;
}

export function createSpiderfier(map: mapboxgl.Map, options: SpiderfierOptions): Spiderfier {
    let marker: mapboxgl.Marker | null = null;

    const close = () => {
        marker?.remove();
        marker = null;
    };

    const open = (subjects: MapSubject[], anchor: [number, number]) => {
        close();
        if (subjects.length === 0) return;

        const positions = spiderfyPositions(subjects.length);
        const extent = spiderfyExtent(positions) + SPIDERFY_BADGE_SIZE_PX;

        const container = document.createElement('div');
        container.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;z-index:10;';

        // Legs + the dot pinpointing the true location
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(extent * 2));
        svg.setAttribute('height', String(extent * 2));
        svg.setAttribute('viewBox', `${-extent} ${-extent} ${extent * 2} ${extent * 2}`);
        svg.style.cssText = `position:absolute;left:${-extent}px;top:${-extent}px;overflow:visible;`;
        svg.innerHTML =
            positions
                .map(position =>
                    `<line x1="0" y1="0" x2="${position.x}" y2="${position.y}" stroke="${LEG_COLOR}" stroke-width="1.5"/>`)
                .join('') +
            `<circle cx="0" cy="0" r="4" fill="${INK}" stroke="#ffffff" stroke-width="2"/>`;
        container.appendChild(svg);

        subjects.forEach((subject, index) => {
            const position = positions[index];
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('aria-label', subject.name);
            button.title = subject.name;
            button.style.cssText =
                `position:absolute;left:${position.x}px;top:${position.y}px;` +
                `width:${SPIDERFY_BADGE_SIZE_PX}px;height:${SPIDERFY_BADGE_SIZE_PX}px;` +
                'transform:translate(-50%,-50%);padding:0;border:0;background:none;cursor:pointer;' +
                'pointer-events:auto;border-radius:50%;line-height:0;' +
                'transition:transform 150ms ease-out;';
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translate(-50%,-50%) scale(1.12)';
                options.onHover?.(subject.id);
            });
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translate(-50%,-50%)';
                options.onHover?.(null);
            });
            button.addEventListener('click', event => {
                event.stopPropagation();
                options.onSelect(subject);
            });

            // Topic badge artwork; a plain disc until (or unless) it resolves
            button.innerHTML =
                `<div style="width:100%;height:100%;border-radius:50%;background:${subject.topicColor};` +
                `border:2px solid #ffffff;box-shadow:0 1px 3px rgb(0 0 0 / 0.25)"></div>`;
            void createPinBadgeSvg({ colorHex: subject.topicColor, icon: subject.topicIcon }).then(svgMarkup => {
                if (svgMarkup && button.isConnected) {
                    button.innerHTML = svgMarkup
                        .replace('width="64"', `width="${SPIDERFY_BADGE_SIZE_PX}"`)
                        .replace('height="64"', `height="${SPIDERFY_BADGE_SIZE_PX}"`);
                }
            });

            if (!options.reducedMotion && typeof button.animate === 'function') {
                button.animate(
                    [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                    ],
                    { duration: 180, easing: 'ease-out', delay: index * 12, fill: 'backwards' },
                );
            }
            container.appendChild(button);
        });

        marker = new mapboxgl.Marker({ element: container, anchor: 'center' })
            .setLngLat(anchor)
            .addTo(map);
    };

    return {
        open,
        close,
        isOpen: () => marker !== null,
        destroy: close,
    };
}
