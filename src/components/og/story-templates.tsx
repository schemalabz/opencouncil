import type React from "react";
import fs from "fs";
import path from "path";
import { OpenCouncilWatermark, formatCityDisplayName } from "./shared-components";
import type { StoryTemplateNumber } from "./story-template-meta";

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

const bgDarkDotsDataUri = loadBgDataUri("bg-dark-dots.png");
const bgPeachDotsDataUri = loadBgDataUri("bg-peach-dots.png");

// Inline lucide-react icon path data. The lucide-react React component sets `stroke`
// only on the outer <svg> and relies on attribute inheritance to the child <path>s —
// satori (powering @vercel/og) doesn't resolve that reliably, so icons would render
// as invisible strokes. Here we apply stroke attributes explicitly to every child.
// Paths copied verbatim from lucide-react v0.436.0 (ISC license).
type IconShape =
    | ["path", { d: string }]
    | ["circle", { cx: string; cy: string; r: string }]
    | ["rect", { width: string; height: string; x: string; y: string; rx?: string; ry?: string }]
    | ["line", { x1: string; x2: string; y1: string; y2: string }];

interface TopicIconEntry {
    /** Kebab-case lucide icon name (matches Topic.icon in the DB and lucide's keys). */
    name: string;
    shapes: IconShape[];
}

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

const TopicIcon = ({
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

export type { StoryTemplateNumber } from "./story-template-meta";
export { STORY_TEMPLATES, isValidStoryTemplate } from "./story-template-meta";

// ---------- Types ----------

export interface StorySubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    nonAgendaReason: "beforeAgenda" | "outOfAgenda" | null;
    topic?: {
        name?: string | null;
        colorHex?: string | null;
        icon?: string | null;
    } | null;
}

export interface StoryTemplateData {
    meetingName: string;
    meetingDate: Date;
    cityName: string;
    cityLogoImage: string | null;
    adminBodyName?: string | null;
    subjects: StorySubject[];
}

// ---------- Helpers ----------

const PRIMARY_PILL_FALLBACK = "#9CA3AF";

function splitSubjects(subjects: StorySubject[]) {
    const preAgenda = subjects.filter((s) => s.nonAgendaReason === "beforeAgenda");
    const outOfAgenda = subjects.filter((s) => s.nonAgendaReason === "outOfAgenda");
    const agenda = subjects
        .filter((s) => s.nonAgendaReason === null)
        .sort((a, b) => (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0));
    return { preAgenda, outOfAgenda, agenda };
}

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function formatDdMmYy(d: Date): string {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

function formatLongDateEl(d: Date): string {
    return d.toLocaleDateString("el-GR", { year: "numeric", month: "long", day: "numeric" });
}

function formatMonthEl(d: Date, casing: "long" | "longCapitalized" = "long"): string {
    const month = d.toLocaleDateString("el-GR", { month: "long" });
    if (casing === "longCapitalized") return month.charAt(0).toUpperCase() + month.slice(1);
    return month;
}

// ---------- Building blocks ----------

interface PillProps {
    subject: StorySubject;
    palette: "light" | "dark";
}

const SectionLabel = ({
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

const SubjectRow = ({ subject, palette }: PillProps) => {
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

const RemainderLine = ({
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

// ---------- T1 — Classic (cream / clean) ----------

const Template1Classic = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);
    const preAgendaRemaining = Math.max(0, preAgenda.length - preAgendaShown.length);
    // Greek long-form weekday name, e.g. "Δευτέρα", "Τρίτη", ...
    const weekday = data.meetingDate.toLocaleDateString("el-GR", { weekday: "long" });

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: "#F5EFE6",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 56 }}>
                {data.cityLogoImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            width: 110,
                            height: 110,
                            background: "#E7DDC9",
                            borderRadius: 16,
                            marginRight: 40,
                        }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 28, color: "#6B7280", marginTop: 4 }}>
                        {data.adminBodyName}
                    </span>
                </div>
            </div>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 52 }}>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    Συνεδρίαση
                </span>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    {formatDdMmYy(data.meetingDate)}
                </span>
            </div>

            {/* Meta row */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    color: "#4B5563",
                    fontSize: 40,
                    marginBottom: 56,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📅</span>
                    <span style={{ display: "flex" }}>{weekday}, {formatLongDateEl(data.meetingDate)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📋</span>
                    <span style={{ display: "flex" }}>{data.subjects.length} θέματα</span>
                </div>
            </div>

            {/* Pre-agenda section */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={preAgenda.length} color="#6B7280">
                        Πρό ημερησίας
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="light" />
                    ))}
                </div>
            )}

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
                    {preAgendaRemaining > 0 && (
                        <RemainderLine count={preAgendaRemaining} color="#6B7280" label="ακόμα θέματα προ ημερησίας" />
                    )}
                </div>
            )}

            {/* Agenda section */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={agenda.length} color="#6B7280">
                        Ημερήσια διάταξη
                    </SectionLabel>
                    {agendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="light" />
                    ))}
                </div>
            )}

            {/* Remainder */}
            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B7280" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T2 — Dark (dark with hero date) ----------

const Template2Dark = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);
    const preAgendaRemaining = Math.max(0, preAgenda.length - preAgendaShown.length);

    const month = formatMonthEl(data.meetingDate);
    // Greek long-form weekday name, e.g. "Δευτέρα", "Τρίτη", ...
    const weekday = data.meetingDate.toLocaleDateString("el-GR", { weekday: "long" });

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                backgroundColor: "#0B0B0B",
                color: "#F5F5F5",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {bgDarkDotsDataUri && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={bgDarkDotsDataUri}
                    alt=""
                    width={1080}
                    height={1920}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: 1080,
                        height: 1920,
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Top strip in a full-width light-tinted wrapper */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    marginLeft: -56,
                    marginRight: -56,
                    padding: "32px 56px",
                    marginBottom: 88,
                    backgroundColor: "#ffffff",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                {data.cityLogoImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 32,
                            fontWeight: 600,
                            color: "#1f2937ad",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                        }}
                    >
                        {data.adminBodyName}
                    </span>
                    <span style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#1F2937", marginTop: 4 }}>
                        {data.cityName}
                    </span>
                </div>
            </div>

            {/* Hero date */}
            <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 28 }}>
                <span
                    style={{
                        display: "flex",
                        fontSize: 320,
                        fontWeight: 900,
                        color: "#FFFFFF",
                        lineHeight: 0.85,
                        letterSpacing: "-0.04em",
                    }}
                >
                    {pad2(data.meetingDate.getDate())}
                </span>
                <div style={{ display: "flex", flexDirection: "column", marginLeft: 28, marginBottom: 18 }}>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 56,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            lineHeight: 1,
                        }}
                    >
                        {weekday}
                    </span>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 56,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            lineHeight: 1,
                        }}
                    >
                        {month}
                    </span>
                    <span style={{ display: "flex", fontSize: 32, color: "#9CA3AF", marginTop: 8 }}>
                        {data.meetingDate.getFullYear()}
                    </span>
                </div>
            </div>

            {/* Meta strip */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    color: "#9CA3AF",
                    fontSize: 32,
                    marginBottom: 48,
                }}
            >
                <span style={{ display: "flex" }}>Συζητήθηκαν {data.subjects.length} θέματα</span>
            </div>

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={preAgenda.length} color="#9CA3AF">
                        Πρό ημερησίας
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="dark" />
                    ))}
                </div>
            )}

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 64 }}>
                    {preAgendaRemaining > 0 && (
                        <RemainderLine count={preAgendaRemaining} color="#9CA3AF" label="ακόμα θέματα στην προ ημερησία" />
                    )}
                </div>
            )}

            {/* Agenda section */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={agenda.length} color="#9CA3AF">
                        Ημερήσια διάταξη
                    </SectionLabel>
                    {agendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="dark" />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#9CA3AF" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoOnly color="white" size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T3 — With Cards (cream / clean, T1 base with subject cards) ----------

// Card showing one subject with its topic icon + color + name.
// Topic color drives the border + a very light tint of the background; icon sits on the right.
const SubjectCard = ({ subject }: { subject: StorySubject }) => {
    const color = subject.topic?.colorHex || PRIMARY_PILL_FALLBACK;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                width: 460,
                minHeight: 200,
                padding: 22,
                background: `${color}14`,
                borderRadius: 18,
                border: `2px solid ${color}`,
            }}
        >
            {/* Left: text */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: 16 }}>
                {subject.topic?.name && (
                    <span
                        style={{
                            display: "flex",
                            fontSize: 20,
                            fontWeight: 700,
                            color,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            marginBottom: 10,
                        }}
                    >
                        {subject.topic.name}
                    </span>
                )}
                <span
                    style={{
                        display: "flex",
                        fontSize: 26,
                        fontWeight: 700,
                        color: "#1F2937",
                        lineHeight: 1.25,
                    }}
                >
                    {subject.name}
                </span>
            </div>
            {/* Right: icon */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 64,
                    height: 64,
                    flexShrink: 0,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color={color} size={48} />
            </div>
        </div>
    );
};

const SubjectCardGrid = ({ subjects }: { subjects: StorySubject[] }) => (
    <div
        style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 16,
        }}
    >
        {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} />
        ))}
    </div>
);

const Template3WithCards = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 4);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);
    const preAgendaRemaining = Math.max(0, preAgenda.length - preAgendaShown.length);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: "#FAFAF8",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Header (mirrors T1) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 48 }}>
                {data.cityLogoImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            width: 110,
                            height: 110,
                            background: "#E7DDC9",
                            borderRadius: 16,
                            marginRight: 40,
                        }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 28, color: "#6B7280", marginTop: 4 }}>
                        {data.adminBodyName}
                    </span>
                </div>
            </div>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 32 }}>
                <span style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    Συνεδρίαση
                </span>
                <span style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    {formatDdMmYy(data.meetingDate)}
                </span>
            </div>

            {/* Meta row */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    color: "#4B5563",
                    fontSize: 28,
                    marginBottom: 36,
                }}
            >
                <span style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>Συζητήθηκαν {data.subjects.length} θέματα</span>
            </div>

            {/* Pre-agenda cards */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
                    <SectionLabel count={preAgenda.length} color="#6B7280">
                        Πρό ημερησίας
                    </SectionLabel>
                    <SubjectCardGrid subjects={preAgendaShown} />
                </div>
            )}

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
                    {preAgendaRemaining > 0 && (
                        <RemainderLine count={preAgendaRemaining} color="#6B7280" label="ακόμα θέματα προ ημερησίας" />
                    )}
                </div>
            )}

            {/* Agenda cards */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel count={agenda.length} color="#6B7280">
                        Ημερήσια διάταξη
                    </SectionLabel>
                    <SubjectCardGrid subjects={agendaShown} />
                </div>
            )}

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B7280" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T4 — Colorful (tilted stickers on a peach pad) ----------

// One subject rendered as a tilted, full-color sticker with letter circle, number, and name.
const SubjectSticker = ({
    subject,
    tilt,
}: {
    subject: StorySubject;
    tilt: number;
}) => {
    const color = subject.topic?.colorHex || PRIMARY_PILL_FALLBACK;
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                width: 880,
                padding: "16px 22px",
                background: color,
                borderRadius: 16,
                borderColor: "#000000",
                borderStyle: "solid",
                borderWidth: 2,
                marginBottom: 14,
                transform: `rotate(${tilt}deg)`,
                boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
            }}
        >
            {/* Icon circle */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: "rgba(255,255,255,0.22)",
                    marginRight: 18,
                    flexShrink: 0,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color="#FFFFFF" size={28} />
            </div>
            {/* Number + name */}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {subject.agendaItemIndex && (
                    <span
                        style={{
                            display: "flex",
                            fontSize: 24,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.72)",
                            letterSpacing: "0.18em",
                        }}
                    >
                        #{pad2(subject.agendaItemIndex ?? 0)}
                    </span>
                )}
                <span
                    style={{
                        display: "flex",
                        fontSize: 28,
                        fontWeight: 800,
                        color: "#FFFFFF",
                        lineHeight: 1.2,
                        marginTop: 2,
                    }}
                >
                    {subject.name}
                </span>
            </div>
        </div>
    );
};

// Tilted dark label used for section headings. Sharp corners + hard-offset gray block
// behind it, mirroring the 3D look of the "Συνεδρίαση" sticker.
const StickerSectionLabel = ({
    children,
    background = "#1A1A1A",
    tilt = -1,
}: {
    children: React.ReactNode;
    background?: string;
    tilt?: number;
}) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            alignSelf: "center",
            background,
            padding: "12px 22px",
            marginBottom: 24,
            transform: `rotate(${tilt}deg)`,
            boxShadow: "8px 8px 0 0 #6B7280",
        }}
    >
        <span
            style={{
                display: "flex",
                fontSize: 20,
                fontWeight: 800,
                color: "#FFFFFF",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
            }}
        >
            {children}
        </span>
    </div>
);

const Template4Colorful = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const preAgendaRemaining = Math.max(0, preAgenda.length - preAgendaShown.length);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);

    // Short Greek date for the date pill (e.g. "14 Ιαν" / "2026"). The el-GR short month
    // sometimes returns a trailing period — strip it for a cleaner look.
    const day = data.meetingDate.getDate();
    const monthShort = data.meetingDate
        .toLocaleDateString("el-GR", { month: "short" })
        .replace(/\.$/, "");
    const year = data.meetingDate.getFullYear();

    // Alternate tilt direction across stickers for the collage feel.
    const stickerTilt = (i: number): number => (i % 2 === 0 ? -1.2 : 1.2);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                background: "#ffbd9c",
                padding: "56px 48px",
                position: "relative",
            }}
        >
            {bgPeachDotsDataUri && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={bgPeachDotsDataUri}
                    alt=""
                    width={1080}
                    height={1920}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: 1080,
                        height: 1920,
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Header (mirrors Template 3) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 120 }}>
                {data.cityLogoImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={130}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            width: 110,
                            height: 110,
                            background: "#E7DDC9",
                            borderRadius: 16,
                            marginRight: 40,
                        }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 28, color: "#1f2937e4", marginTop: 4 }}>
                        {data.adminBodyName}
                    </span>
                </div>
            </div>

            {/* "Συνεδρίαση" title sticker + date pill */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 52 }}>
                <div
                    style={{
                        display: "flex",
                        background: "#1A1A1A",
                        padding: "14px 28px",
                        transform: "rotate(-2deg)",
                        // Hard-offset shadow = solid yellow block behind the sticker, 3D-stacked feel.
                        boxShadow: "10px 10px 0 0 #F4C430",
                    }}
                >
                    <span style={{ display: "flex", fontSize: 72, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
                        Συνεδρίαση
                    </span>
                </div>
                {/* Date pill */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#2563EB",
                        padding: "14px 24px",
                        borderRadius: 100,
                        marginLeft: 28,
                        transform: "rotate(4deg)",
                        boxShadow: "6px 6px 0 0 #1A1A1A",
                    }}
                >
                    <span style={{ display: "flex", fontSize: 40, fontWeight: 900, color: "#FFFFFF", lineHeight: 1 }}>
                        {day} {monthShort}
                    </span>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 20,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            marginTop: 4,
                            opacity: 0.85,
                            letterSpacing: "0.1em",
                        }}
                    >
                        {year}
                    </span>
                </div>
            </div>

            {/* Total subjects pill */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    background: "#a01212",
                    borderRadius: 100,
                    padding: "10px 22px",
                    marginBottom: 56,
                    marginLeft: 52,
                    transform: "rotate(-1.5deg)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                }}
            >
                <span style={{ display: "flex", fontSize: 32, fontWeight: 900, color: "#FFFFFF", marginRight: 10 }}>
                    {data.subjects.length}
                </span>
                <span
                    style={{
                        display: "flex",
                        fontSize: 18,
                        color: "#FFFFFF",
                        letterSpacing: "0.22em",
                        fontWeight: 700,
                    }}
                >
                    ΘΕΜΑΤΑ ΣΥΝΟΛΙΚΑ
                </span>
            </div>

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <StickerSectionLabel background="#2A4A3E" tilt={-1.5}>
                        ΠΡΟ ΗΜΕΡΗΣΙΑΣ · {preAgenda.length}
                    </StickerSectionLabel>
                    {preAgendaShown.map((s, i) => (
                        <SubjectSticker key={s.id} subject={s} tilt={stickerTilt(i)} />
                    ))}

                </div>
            )}

            {preAgendaRemaining > 0 && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    background: "#ff6600",
                    borderRadius: 100,
                    padding: "10px 22px",
                    marginLeft: 52,
                    marginBottom: 56
                }}>
                    {preAgendaRemaining > 0 && (
                        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#FFFFFF" }}>
                            + {preAgendaRemaining} ακόμα
                        </span>
                    )}
                </div>
            )}

            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <StickerSectionLabel background="#1A1A1A" tilt={-1}>
                        ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΞΗ · {agenda.length}
                    </StickerSectionLabel>
                    {agendaShown.map((s, i) => (
                        <SubjectSticker
                            key={s.id}
                            subject={s}
                            tilt={stickerTilt(i + 1)}
                        />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        alignSelf: "flex-start",
                        background: "#ff6600",
                        borderRadius: 100,
                        padding: "10px 22px",
                        marginLeft: 52,
                        marginTop: 8,
                    }}
                >
                    <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#FFFFFF" }}>
                        + {agendaRemaining} ακόμα
                    </span>
                </div>
            )}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- Dispatcher ----------

export function renderStoryTemplate(template: StoryTemplateNumber, data: StoryTemplateData): React.ReactElement {
    switch (template) {
        case 2:
            return Template2Dark(data);
        case 3:
            return Template3WithCards(data);
        case 4:
            return Template4Colorful(data);
        case 1:
        default:
            return Template1Classic(data);
    }
}
