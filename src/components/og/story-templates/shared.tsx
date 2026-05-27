import type React from "react";
import type { PillProps } from "./types";

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
            {/* Solid colored marker — icon SVG removed to keep satori render cheap. */}
            <div
                style={{
                    display: "flex",
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: color,
                    marginRight: 16,
                    flexShrink: 0,
                }}
            />
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
