import type React from "react";
import {
    Building,
    Building2,
    Bus,
    Circle,
    Dumbbell,
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
import type { PillProps } from "./types";

// ---------- Helpers ----------

export const PRIMARY_PILL_FALLBACK = "#9CA3AF";

// OpenCouncil's signature font, declared via @font-face in globals.css. We apply
// it on each template's outer div via inline style so the cascade picks it up in
// both the live preview and the html-to-image export. Fallback to system sans so
// font-weights Relative Book Pro doesn't ship (it's a single 400-weight face)
// render in a clean sans rather than synthesizing-bold the brand font.
export const STORY_FONT_FAMILY = "'Relative Book Pro', system-ui, -apple-system, sans-serif";

/**
 * Greek uppercase with τόνοι (accents) stripped — the typographic convention for
 * Greek uppercase. JS `.toLocaleUpperCase("el")` does this on modern engines, but
 * we belt-and-suspenders with an explicit combining-mark strip so the export
 * (rasterized SVG, where locale-aware text-transform doesn't always apply)
 * matches the live preview exactly.
 */
export function uppercaseGreek(s: string): string {
    return s.toLocaleUpperCase("el").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Topic.icon strings in the DB are kebab-case lucide icon names. Map them to
// their components here so templates can render a per-subject icon. Falls
// back to a circle for unknown / absent names.
const TOPIC_ICONS: Record<string, LucideIcon> = {
    "building": Building,
    "building-2": Building2,
    "bus": Bus,
    "dumbbell": Dumbbell,
    "graduation-cap": GraduationCap,
    "heart": Heart,
    "leaf": Leaf,
    "music-2": Music2,
    "recycle": Recycle,
    "shield": Shield,
    "users": Users,
    "wallet": Wallet,
};

export function TopicIcon({
    name,
    color,
    size,
}: {
    name?: string | null;
    color: string;
    size: number;
}) {
    const Icon = (name && TOPIC_ICONS[name]) || Circle;
    return <Icon color={color} size={size} strokeWidth={2} />;
}

// ---------- Building blocks shared between templates ----------

export const SectionLabel = ({
    label,
    count,
    color,
}: {
    label: string;
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
            marginBottom: 16,
        }}
    >
        <div style={{ display: "flex", width: 24, height: 2, background: color, marginRight: 14 }} />
        <span style={{ display: "flex", whiteSpace: "nowrap" }}>{uppercaseGreek(label)}</span>
        <span style={{ display: "flex", marginLeft: 10, opacity: 0.6, whiteSpace: "nowrap" }}>({count})</span>
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
