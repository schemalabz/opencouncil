import type React from "react";
import fs from "fs";
import path from "path";
import {
    Building,
    Building2,
    Bus,
    GraduationCap,
    Heart,
    Leaf,
    Music2,
    Recycle,
    Shield,
    Users,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import type { IconShape, PillProps } from "./types";

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

// Lucide icon components keyed by kebab-case name (matches Topic.icon in the DB).
const ICON_COMPONENTS: Record<string, LucideIcon> = {
    "building": Building,
    "building-2": Building2,
    "bus": Bus,
    "graduation-cap": GraduationCap,
    "heart": Heart,
    "leaf": Leaf,
    "music-2": Music2,
    "recycle": Recycle,
    "shield": Shield,
    "users": Users,
    "wallet": Wallet,
};

// Extract each icon's shape data from lucide-react at module load. Lucide's
// forwardRef-wrapped components pass an `iconNode` prop through to an internal
// <Icon> component; calling `.render()` once gives us back the `[[tag, attrs], ...]`
// array lucide built from. We can't just render the lucide components directly
// in OG output because satori (powering @vercel/og) doesn't resolve stroke
// inheritance from the parent <svg> down to child shapes — so `TopicIcon` below
// re-renders each shape with stroke applied explicitly.
const TOPIC_ICONS = new Map<string, IconShape[]>(
    Object.entries(ICON_COMPONENTS).map(([name, Component]) => {
        const rendered = (Component as unknown as { render: (props: object, ref: null) => { props: { iconNode: IconShape[] } } }).render({}, null);
        return [name, rendered.props.iconNode];
    }),
);

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
    const shapes = (name && TOPIC_ICONS.get(name)) || FALLBACK_ICON_SHAPES;
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
