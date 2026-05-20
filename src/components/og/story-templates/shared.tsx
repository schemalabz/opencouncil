import type React from "react";
import fs from "fs";
import path from "path";
import type { IconShape, TopicIconEntry, StorySubject, PillProps } from "./types";

// Background assets — read once at module load and inlined as data URIs.
// @vercel/og's <img> can fetch URLs, but inlining avoids any same-origin/fetch concerns.
function loadBgDataUri(filename: string): string {
    try {
        const buf = fs.readFileSync(path.join(process.cwd(), "public", "og", filename));
        return `data:image/png;base64,${buf.toString("base64")}`;
    } catch (error) {
        console.error(`Failed to load ${filename}:`, error);
        return "";
    }
}

export const bgDarkDotsDataUri = loadBgDataUri("bg-dark-dots.png");
export const bgPeachDotsDataUri = loadBgDataUri("bg-peach-dots.png");

// Inline lucide-react icon path data. The lucide-react React component sets `stroke`
// only on the outer <svg> and relies on attribute inheritance to the child <path>s —
// satori (powering @vercel/og) doesn't resolve that reliably, so icons would render
// as invisible strokes. Here we apply stroke attributes explicitly to every child.
// Paths copied verbatim from lucide-react v0.436.0 (ISC license).
const TOPIC_ICONS: TopicIconEntry[] = [
    {
        name: "shield",
        shapes: [
            ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
        ],
    },
    {
        name: "building-2",
        shapes: [
            ["path", { d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" }],
            ["path", { d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" }],
            ["path", { d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" }],
            ["path", { d: "M10 6h4" }],
            ["path", { d: "M10 10h4" }],
            ["path", { d: "M10 14h4" }],
            ["path", { d: "M10 18h4" }],
        ],
    },
    {
        name: "recycle",
        shapes: [
            ["path", { d: "M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5" }],
            ["path", { d: "M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12" }],
            ["path", { d: "m14 16-3 3 3 3" }],
            ["path", { d: "M8.293 13.596 7.196 9.5 3.1 10.598" }],
            ["path", { d: "m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843" }],
            ["path", { d: "m13.378 9.633 4.096 1.098 1.097-4.096" }],
        ],
    },
    {
        name: "graduation-cap",
        shapes: [
            ["path", { d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" }],
            ["path", { d: "M22 10v6" }],
            ["path", { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" }],
        ],
    },
    {
        name: "leaf",
        shapes: [
            ["path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" }],
            ["path", { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" }],
        ],
    },
    {
        name: "building",
        shapes: [
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
    },
    {
        name: "music-2",
        shapes: [
            ["circle", { cx: "8", cy: "18", r: "4" }],
            ["path", { d: "M12 18V2l7 4" }],
        ],
    },
    {
        name: "heart",
        shapes: [
            ["path", { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }],
        ],
    },
    {
        name: "wallet",
        shapes: [
            ["path", { d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" }],
            ["path", { d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" }],
        ],
    },
    {
        name: "bus",
        shapes: [
            ["path", { d: "M8 6v6" }],
            ["path", { d: "M15 6v6" }],
            ["path", { d: "M2 12h19.6" }],
            ["path", { d: "M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" }],
            ["circle", { cx: "7", cy: "18", r: "2" }],
            ["path", { d: "M9 18h5" }],
            ["circle", { cx: "16", cy: "18", r: "2" }],
        ],
    },
    {
        name: "users",
        shapes: [
            ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
            ["circle", { cx: "9", cy: "7", r: "4" }],
            ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
            ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
        ],
    },
];

const FALLBACK_ICON_SHAPES: IconShape[] = [
    ["circle", { cx: "12", cy: "12", r: "4" }],
];

export const TopicIcon = ({
    name,
    color,
    size,
}: {
    name?: string | null;
    color: string;
    size: number;
}) => {
    const entry = name ? TOPIC_ICONS.find((i) => i.name === name) : null;
    const shapes = entry?.shapes ?? FALLBACK_ICON_SHAPES;
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
                if (tag === "path") return <path key={i} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d={attrs.d} />;
                if (tag === "circle")
                    return <circle key={i} stroke={color} strokeWidth={2} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />;
                if (tag === "rect")
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
                if (tag === "line")
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
                return null;
            })}
        </svg>
    );
};

// ---------- Helpers ----------

export const PRIMARY_PILL_FALLBACK = "#9CA3AF";

export function splitSubjects(subjects: StorySubject[]) {
    const preAgenda = subjects.filter((s) => s.nonAgendaReason === "beforeAgenda");
    const outOfAgenda = subjects.filter((s) => s.nonAgendaReason === "outOfAgenda");
    const agenda = subjects.filter((s) => s.nonAgendaReason === null);
    return { preAgenda, outOfAgenda, agenda };
}

// ---------- Building blocks shared between templates ----------

export const SectionLabel = ({
    children,
    count,
    color,
}: {
    children: React.ReactNode;
    count: number;
    color: string;
}) => (
    <div
        style={{
            display: "flex",
            alignSelf: "center",
            alignItems: "center",
            color,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 16,
        }}
    >
        <div style={{ display: "flex", width: 24, height: 2, background: color, marginRight: 14 }} />
        <span style={{ display: "flex" }}>{children}</span>
        <span style={{ display: "flex", marginLeft: 10, opacity: 0.6 }}>({count})</span>
    </div>
);

export const SubjectRow = ({ subject, palette }: PillProps) => {
    const color = subject.topic?.colorHex || PRIMARY_PILL_FALLBACK;
    const textColor = palette === "dark" ? "#F5F5F5" : "#1F2937";
    const bg = palette === "dark" ? "#1A1A1A" : "#FFFFFF";
    const border = palette === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.05)";
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 20px",
                background: bg,
                border,
                borderRadius: 16,
                marginBottom: 12,
                boxShadow: palette === "dark" ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: color,
                    marginRight: 16,
                    flexShrink: 0,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color="#FFFFFF" size={28} />
            </div>
            <span
                style={{
                    display: "flex",
                    color: textColor,
                    fontSize: 32,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {subject.name}
            </span>
        </div>
    );
};

export const RemainderLine = ({
    count,
    color,
    label,
}: {
    count: number;
    color: string;
    /** Suffix shown after "+ N ", e.g. "ακόμα θέματα στην ημερήσια διάταξη". */
    label: string;
}) => (
    <div style={{ display: "flex", color, fontSize: 28, marginTop: 18 }}>
        <span style={{ display: "flex" }}>+ {count} {label}</span>
    </div>
);
