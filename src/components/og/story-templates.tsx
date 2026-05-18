import type React from "react";
import { OpenCouncilWatermark, formatCityDisplayName } from "./shared-components";
import type { StoryTemplateNumber } from "./story-template-meta";

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

function topicLetter(topicName?: string | null): string {
    if (!topicName) return "·";
    return topicName.trim().charAt(0).toUpperCase();
}

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function formatDdMmYy(d: Date): string {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

function formatDdMm(d: Date): string {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function formatLongDateEl(d: Date): string {
    return d.toLocaleDateString("el-GR", { year: "numeric", month: "long", day: "numeric" });
}

function formatMonthEl(d: Date, casing: "long" | "longCapitalized" = "long"): string {
    const month = d.toLocaleDateString("el-GR", { month: "long" });
    if (casing === "longCapitalized") return month.charAt(0).toUpperCase() + month.slice(1);
    return month;
}

function issueNumberFromDate(d: Date): string {
    const dayOfYear = Math.floor(
        (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    return pad2(dayOfYear).padStart(3, "0");
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
            alignItems: "center",
            color,
            fontSize: 22,
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
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: color,
                    color: "#FFFFFF",
                    fontSize: 22,
                    fontWeight: 800,
                    marginRight: 16,
                    flexShrink: 0,
                }}
            >
                {topicLetter(subject.topic?.name)}
            </div>
            <span
                style={{
                    display: "flex",
                    color: textColor,
                    fontSize: 28,
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

const RemainderLine = ({ count, color }: { count: number; color: string }) => (
    <div style={{ display: "flex", color, fontSize: 22, marginTop: 18 }}>
        <span style={{ display: "flex" }}>+ {count} ακόμα θέματα στην ημερήσια διάταξη</span>
    </div>
);

// ---------- T1 — Refined Original (cream / clean) ----------

const Template1RefinedOriginal = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const cityDisplay = formatCityDisplayName(data.cityName, data.adminBodyName);

    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#F5EFE6",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 56 }}>
                {data.cityLogoImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={96}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 20 }}
                    />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            width: 96,
                            height: 96,
                            background: "#E7DDC9",
                            borderRadius: 16,
                            marginRight: 20,
                        }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#1F2937" }}>
                        {cityDisplay}
                    </span>
                    <span style={{ display: "flex", fontSize: 24, color: "#6B7280", marginTop: 4 }}>
                        Δημοτικό Συμβούλιο
                    </span>
                </div>
            </div>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
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
                    fontSize: 26,
                    marginBottom: 44,
                }}
            >
                <span style={{ display: "flex", marginRight: 10 }}>📅</span>
                <span style={{ display: "flex", marginRight: 28 }}>{formatLongDateEl(data.meetingDate)}</span>
                <span style={{ display: "flex", marginRight: 10 }}>📋</span>
                <span style={{ display: "flex" }}>{data.subjects.length} θέματα</span>
            </div>

            {/* Pre-agenda section */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
                    <SectionLabel count={preAgenda.length} color="#6B7280">
                        Πρό ημερησίας
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="light" />
                    ))}
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
            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B7280" />}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T2 — Editorial Date (dark) ----------

const Template2EditorialDate = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const cityDisplay = formatCityDisplayName(data.cityName, data.adminBodyName);

    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);

    const month = formatMonthEl(data.meetingDate);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#0B0B0B",
                color: "#F5F5F5",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Top strip */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 56,
                }}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    {data.cityLogoImage && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={data.cityLogoImage}
                            height={56}
                            alt="City Logo"
                            style={{ objectFit: "contain", marginRight: 16, filter: "brightness(0) invert(1)" }}
                        />
                    )}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <span
                            style={{
                                display: "flex",
                                fontSize: 20,
                                fontWeight: 600,
                                color: "#9CA3AF",
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                            }}
                        >
                            Δημοτικό Συμβούλιο
                        </span>
                        <span style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#F5F5F5", marginTop: 4 }}>
                            {cityDisplay}
                        </span>
                    </div>
                </div>
                <span
                    style={{
                        display: "flex",
                        fontSize: 22,
                        color: "#9CA3AF",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                    }}
                >
                    № {issueNumberFromDate(data.meetingDate)}
                </span>
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
                    fontSize: 24,
                    marginBottom: 48,
                }}
            >
                <span style={{ display: "flex" }}>{data.subjects.length} θέματα</span>
                <span style={{ display: "flex", margin: "0 16px" }}>·</span>
                <span style={{ display: "flex" }}>{preAgenda.length} πρό ημερησίας</span>
                <span style={{ display: "flex", margin: "0 16px" }}>·</span>
                <span style={{ display: "flex" }}>{agenda.length} ημερήσιας</span>
            </div>

            {/* Pre-agenda section */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
                    <SectionLabel count={preAgenda.length} color="#9CA3AF">
                        Πρό ημερησίας
                    </SectionLabel>
                    {preAgendaShown.map((s) => (
                        <SubjectRow key={s.id} subject={s} palette="dark" />
                    ))}
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

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#9CA3AF" />}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T3 — Riso Poster (cream/peach) ----------

const RisoNumberedRow = ({
    index,
    subject,
    color,
}: {
    index: number;
    subject: StorySubject;
    color: string;
}) => (
    <div style={{ display: "flex", alignItems: "center", padding: "14px 0" }}>
        <span
            style={{
                display: "flex",
                width: 64,
                fontSize: 24,
                fontWeight: 700,
                color: "#6B4F2A",
                letterSpacing: "0.06em",
            }}
        >
            {pad2(index)}
        </span>
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 20,
                background: color,
                color: "#FFFFFF",
                fontSize: 20,
                fontWeight: 800,
                marginRight: 18,
                flexShrink: 0,
            }}
        >
            {topicLetter(subject.topic?.name)}
        </div>
        <span
            style={{
                display: "flex",
                color: "#1F1A12",
                fontSize: 28,
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

const DottedDivider = () => (
    <div
        style={{
            display: "flex",
            width: "100%",
            height: 2,
            background:
                "repeating-linear-gradient(to right, #6B4F2A 0, #6B4F2A 4px, transparent 4px, transparent 12px)",
            marginTop: 12,
            marginBottom: 12,
            opacity: 0.5,
        }}
    />
);

const Template3RisoPoster = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const cityDisplay = formatCityDisplayName(data.cityName, data.adminBodyName);

    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#FDEDD0",
                color: "#1F1A12",
                padding: "64px 56px",
                position: "relative",
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 28,
                }}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    {data.cityLogoImage && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={data.cityLogoImage}
                            height={72}
                            alt="City Logo"
                            style={{ objectFit: "contain", marginRight: 18 }}
                        />
                    )}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <span
                            style={{
                                display: "flex",
                                fontSize: 18,
                                fontWeight: 700,
                                color: "#6B4F2A",
                                letterSpacing: "0.2em",
                                textTransform: "uppercase",
                            }}
                        >
                            Δημοτικό Συμβούλιο
                        </span>
                        <span style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#1F1A12", marginTop: 2 }}>
                            {cityDisplay}
                        </span>
                    </div>
                </div>
                <span
                    style={{
                        display: "flex",
                        fontSize: 18,
                        color: "#6B4F2A",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                    }}
                >
                    ISSUE №{issueNumberFromDate(data.meetingDate)}
                </span>
            </div>

            {/* Hero date with red circle */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 18, position: "relative" }}>
                <div
                    style={{
                        position: "absolute",
                        right: 80,
                        top: -10,
                        width: 220,
                        height: 220,
                        borderRadius: 110,
                        background: "#E03B2B",
                        opacity: 0.95,
                    }}
                />
                <span
                    style={{
                        display: "flex",
                        fontSize: 240,
                        fontWeight: 900,
                        color: "#1F1A12",
                        lineHeight: 0.9,
                        letterSpacing: "-0.04em",
                        position: "relative",
                    }}
                >
                    {formatDdMm(data.meetingDate)}
                </span>
            </div>

            <span style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#1F1A12", lineHeight: 1.2, marginBottom: 12 }}>
                {data.meetingName}
            </span>
            <span style={{ display: "flex", fontSize: 22, color: "#6B4F2A", marginBottom: 28 }}>
                {data.subjects.length} θέματα · {formatLongDateEl(data.meetingDate)}
            </span>

            {/* Pre-agenda */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: 26,
                            fontWeight: 800,
                            color: "#1F1A12",
                        }}
                    >
                        <span style={{ display: "flex" }}>Πρό ημερησίας</span>
                        <span style={{ display: "flex", marginLeft: 10, color: "#6B4F2A" }}>({preAgenda.length})</span>
                    </div>
                    <DottedDivider />
                    {preAgendaShown.map((s, i) => (
                        <RisoNumberedRow
                            key={s.id}
                            index={i + 1}
                            subject={s}
                            color={s.topic?.colorHex || PRIMARY_PILL_FALLBACK}
                        />
                    ))}
                </div>
            )}

            {/* Agenda */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: 26,
                            fontWeight: 800,
                            color: "#1F1A12",
                        }}
                    >
                        <span style={{ display: "flex" }}>Ημερήσια διάταξη</span>
                        <span style={{ display: "flex", marginLeft: 10, color: "#6B4F2A" }}>({agenda.length})</span>
                    </div>
                    <DottedDivider />
                    {agendaShown.map((s, i) => (
                        <RisoNumberedRow
                            key={s.id}
                            index={s.agendaItemIndex ?? i + 1}
                            subject={s}
                            color={s.topic?.colorHex || PRIMARY_PILL_FALLBACK}
                        />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B4F2A" />}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};

// ---------- T4 — Civic Board (terminal) ----------

const CivicBoardRow = ({ index, subject }: { index: number; subject: StorySubject }) => {
    const color = subject.topic?.colorHex || PRIMARY_PILL_FALLBACK;
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
        >
            <span
                style={{
                    display: "flex",
                    width: 60,
                    fontSize: 22,
                    color: "#9CA3AF",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                }}
            >
                {pad2(index)}
            </span>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: color,
                    color: "#FFFFFF",
                    fontSize: 18,
                    fontWeight: 800,
                    marginRight: 18,
                    flexShrink: 0,
                }}
            >
                {topicLetter(subject.topic?.name)}
            </div>
            <span
                style={{
                    display: "flex",
                    color: "#F5F5F5",
                    fontSize: 26,
                    fontWeight: 600,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {subject.name}
            </span>
            <div
                style={{
                    display: "flex",
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: "#22C55E",
                    boxShadow: "0 0 12px rgba(34,197,94,0.55)",
                    marginLeft: 16,
                }}
            />
        </div>
    );
};

const CivicSectionHeader = ({
    en,
    el,
    count,
}: {
    en: string;
    el: string;
    count: number;
}) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 20px",
            background: "rgba(255,255,255,0.04)",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            fontSize: 18,
            color: "#9CA3AF",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
        }}
    >
        <span style={{ display: "flex" }}>{en}</span>
        <span style={{ display: "flex", margin: "0 12px", opacity: 0.6 }}>·</span>
        <span style={{ display: "flex" }}>{el}</span>
        <span style={{ display: "flex", marginLeft: "auto", color: "#22C55E" }}>[{pad2(count)}]</span>
    </div>
);

const CivicDataCell = ({ label, value }: { label: string; value: string }) => (
    <div
        style={{
            display: "flex",
            flexDirection: "column",
            padding: "14px 20px",
            flex: 1,
            borderRight: "1px solid rgba(255,255,255,0.12)",
        }}
    >
        <span
            style={{
                display: "flex",
                fontSize: 14,
                color: "#9CA3AF",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 6,
            }}
        >
            {label}
        </span>
        <span style={{ display: "flex", fontSize: 28, fontWeight: 800, color: "#F5F5F5", letterSpacing: "0.04em" }}>
            {value}
        </span>
    </div>
);

const Template4CivicBoard = (data: StoryTemplateData) => {
    const { preAgenda, agenda } = splitSubjects(data.subjects);
    const cityDisplay = formatCityDisplayName(data.cityName, data.adminBodyName);

    const preAgendaShown = preAgenda.slice(0, 2);
    const agendaShown = agenda.slice(0, 3);
    const agendaRemaining = Math.max(0, agenda.length - agendaShown.length);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#000000",
                color: "#F5F5F5",
                padding: "48px 40px",
                position: "relative",
                fontFamily: "Inter",
            }}
        >
            {/* Top strip */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 20px",
                    border: "1px solid rgba(255,255,255,0.12)",
                    fontSize: 18,
                    color: "#22C55E",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 32,
                }}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                        style={{
                            display: "flex",
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            background: "#22C55E",
                            boxShadow: "0 0 12px rgba(34,197,94,0.55)",
                            marginRight: 12,
                        }}
                    />
                    <span style={{ display: "flex" }}>Live</span>
                    <span style={{ display: "flex", margin: "0 12px", color: "#9CA3AF" }}>·</span>
                    <span style={{ display: "flex", color: "#9CA3AF" }}>Δημοτικό Συμβούλιο</span>
                </div>
                <span style={{ display: "flex", color: "#9CA3AF" }}>{formatLongDateEl(data.meetingDate)}</span>
            </div>

            {/* Title block */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 28,
                    padding: "0 4px",
                }}
            >
                {data.cityLogoImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={data.cityLogoImage}
                        height={64}
                        alt="City Logo"
                        style={{ objectFit: "contain", marginRight: 20, filter: "brightness(0) invert(1)" }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 18,
                            color: "#9CA3AF",
                            letterSpacing: "0.22em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                        }}
                    >
                        Δήμος
                    </span>
                    <span style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#F5F5F5", marginTop: 4 }}>
                        {cityDisplay}
                    </span>
                </div>
            </div>

            {/* Meeting name (from DB) */}
            <span
                style={{
                    display: "flex",
                    fontSize: 28,
                    fontWeight: 600,
                    color: "#D1D5DB",
                    lineHeight: 1.2,
                    marginBottom: 24,
                    padding: "0 4px",
                }}
            >
                {data.meetingName}
            </span>

            {/* Data strip */}
            <div
                style={{
                    display: "flex",
                    border: "1px solid rgba(255,255,255,0.12)",
                    marginBottom: 32,
                }}
            >
                <CivicDataCell label="Date" value={formatDdMmYy(data.meetingDate)} />
                <CivicDataCell label="Total" value={pad2(data.subjects.length)} />
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "14px 20px",
                        flex: 1,
                    }}
                >
                    <span
                        style={{
                            display: "flex",
                            fontSize: 14,
                            color: "#9CA3AF",
                            letterSpacing: "0.22em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            marginBottom: 6,
                        }}
                    >
                        Status
                    </span>
                    <span
                        style={{
                            display: "flex",
                            fontSize: 28,
                            fontWeight: 800,
                            color: "#22C55E",
                            letterSpacing: "0.06em",
                        }}
                    >
                        OPEN
                    </span>
                </div>
            </div>

            {/* Pre-agenda */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
                    <CivicSectionHeader en="Pre-agenda" el="Πρό ημερησίας" count={preAgenda.length} />
                    {preAgendaShown.map((s, i) => (
                        <CivicBoardRow key={s.id} index={i + 1} subject={s} />
                    ))}
                </div>
            )}

            {/* Agenda */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <CivicSectionHeader en="Main agenda" el="Ημερήσια διάταξη" count={agenda.length} />
                    {agendaShown.map((s, i) => (
                        <CivicBoardRow key={s.id} index={s.agendaItemIndex ?? i + 1} subject={s} />
                    ))}
                </div>
            )}

            {agendaRemaining > 0 && (
                <div
                    style={{
                        display: "flex",
                        color: "#9CA3AF",
                        fontSize: 20,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        marginTop: 20,
                        padding: "0 20px",
                    }}
                >
                    <span style={{ display: "flex" }}>+ {agendaRemaining} ακόμα θέματα</span>
                </div>
            )}

            <OpenCouncilWatermark logoOnly size={96} bottom={36} right={36} />
        </div>
    );
};

// ---------- Dispatcher ----------

export function renderStoryTemplate(template: StoryTemplateNumber, data: StoryTemplateData): React.ReactElement {
    switch (template) {
        case 2:
            return Template2EditorialDate(data);
        case 3:
            return Template3RisoPoster(data);
        case 4:
            return Template4CivicBoard(data);
        case 1:
        default:
            return Template1RefinedOriginal(data);
    }
}
