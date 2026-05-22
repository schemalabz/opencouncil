// Topic icon renderer for story templates.
//
// We inline lucide's icon shape arrays rather than importing the components, because
// lucide doesn't expose the underlying shape data as public API. Reading it off the
// component (via .render({}, null).props.iconNode) coupled us to a private contract —
// a rename would silently fall back to the circle for every topic, and a structural
// change to .render would throw at module load and crash /api/og.

import type React from "react";

type IconShape =
    | ["path", { d: string }]
    | ["circle", { cx: string; cy: string; r: string }]
    | ["rect", { width: string; height: string; x: string; y: string; rx?: string; ry?: string }]
    | ["line", { x1: string; x2: string; y1: string; y2: string }]
    | ["polygon", { points: string }];

const TOPIC_ICONS: Record<string, IconShape[]> = {
    "building": [
        ["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", ry: "2" }],
        ["path", { d: "M9 22v-4h6v4" }],
        ["path", { d: "M8 6h.01" }],
        ["path", { d: "M16 6h.01" }],
        ["path", { d: "M12 6h.01" }],
        ["path", { d: "M12 10h.01" }],
        ["path", { d: "M12 14h.01" }],
        ["path", { d: "M16 10h.01" }],
        ["path", { d: "M16 14h.01" }],
        ["path", { d: "M8 10h.01" }],
        ["path", { d: "M8 14h.01" }],
    ],
    "building-2": [
        ["path", { d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" }],
        ["path", { d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" }],
        ["path", { d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" }],
        ["path", { d: "M10 6h4" }],
        ["path", { d: "M10 10h4" }],
        ["path", { d: "M10 14h4" }],
        ["path", { d: "M10 18h4" }],
    ],
    "bus": [
        ["path", { d: "M8 6v6" }],
        ["path", { d: "M15 6v6" }],
        ["path", { d: "M2 12h19.6" }],
        ["path", { d: "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" }],
        ["circle", { cx: "7", cy: "18", r: "2" }],
        ["path", { d: "M9 18h5" }],
        ["circle", { cx: "16", cy: "18", r: "2" }],
    ],
    "dumbbell": [
        ["path", { d: "M14.4 14.4 9.6 9.6" }],
        ["path", { d: "M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" }],
        ["path", { d: "m21.5 21.5-1.4-1.4" }],
        ["path", { d: "M3.9 3.9 2.5 2.5" }],
        ["path", { d: "M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" }],
    ],
    "graduation-cap": [
        ["path", { d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" }],
        ["path", { d: "M22 10v6" }],
        ["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" }],
    ],
    "heart": [
        ["path", { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }],
    ],
    "leaf": [
        ["path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" }],
        ["path", { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" }],
    ],
    "music-2": [
        ["circle", { cx: "8", cy: "18", r: "4" }],
        ["path", { d: "M12 18V2l7 4" }],
    ],
    "recycle": [
        ["path", { d: "M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5" }],
        ["path", { d: "M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12" }],
        ["path", { d: "m14 16-3 3 3 3" }],
        ["path", { d: "M8.293 13.596 7.196 9.5 3.1 10.598" }],
        ["path", { d: "m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843" }],
        ["path", { d: "m13.378 9.633 4.096 1.098 1.097-4.096" }],
    ],
    "shield": [
        ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
    ],
    "users": [
        ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
        ["circle", { cx: "9", cy: "7", r: "4" }],
        ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
        ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
    ],
    "wallet": [
        ["path", { d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" }],
        ["path", { d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" }],
    ],
    "store": [
        ["path", { d: "m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" }],
        ["path", { d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" }],
        ["path", { d: "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" }],
        ["path", { d: "M2 7h20" }],
        ["path", { d: "M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" }],
    ],
    "paw-print": [
        ["circle", { cx: "11", cy: "4", r: "2" }],
        ["circle", { cx: "18", cy: "8", r: "2" }],
        ["circle", { cx: "20", cy: "16", r: "2" }],
        ["path", { d: "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" }],
    ],
    "landmark": [
        ["line", { x1: "3", x2: "21", y1: "22", y2: "22" }],
        ["line", { x1: "6", x2: "6", y1: "18", y2: "11" }],
        ["line", { x1: "10", x2: "10", y1: "18", y2: "11" }],
        ["line", { x1: "14", x2: "14", y1: "18", y2: "11" }],
        ["line", { x1: "18", x2: "18", y1: "18", y2: "11" }],
        ["polygon", { points: "12 2 20 7 4 7" }],
    ],
    "luggage": [
        ["path", { d: "M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2" }],
        ["path", { d: "M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14" }],
        ["path", { d: "M10 20h4" }],
        ["circle", { cx: "16", cy: "20", r: "2" }],
        ["circle", { cx: "8", cy: "20", r: "2" }],
    ],
};

const FALLBACK_SHAPES: IconShape[] = [["circle", { cx: "12", cy: "12", r: "4" }]];

interface TopicIconProps {
    name?: string | null;
    color: string;
    size: number;
}

export function TopicIcon({ name, color, size }: TopicIconProps): React.ReactElement {
    const shapes = (name && TOPIC_ICONS[name]) || FALLBACK_SHAPES;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {shapes.map(([tag, attrs], i) => {
                if (tag === "path") {
                    return <path key={i} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d={attrs.d} />;
                }
                if (tag === "circle") {
                    return <circle key={i} stroke={color} strokeWidth={2} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />;
                }
                if (tag === "rect") {
                    return (
                        <rect
                            key={i}
                            stroke={color}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            width={attrs.width}
                            height={attrs.height}
                            x={attrs.x}
                            y={attrs.y}
                            rx={attrs.rx}
                            ry={attrs.ry}
                        />
                    );
                }
                if (tag === "line") {
                    return (
                        <line
                            key={i}
                            stroke={color}
                            strokeWidth={2}
                            strokeLinecap="round"
                            x1={attrs.x1}
                            x2={attrs.x2}
                            y1={attrs.y1}
                            y2={attrs.y2}
                        />
                    );
                }
                if (tag === "polygon") {
                    return (
                        <polygon
                            key={i}
                            stroke={color}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            points={attrs.points}
                        />
                    );
                }
                return null;
            })}
        </svg>
    );
}
