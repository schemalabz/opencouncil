// T3 — Cards: off-white background, large title, subjects as bordered colored cards.

import { format } from "date-fns";
import { OpenCouncilWatermark } from "../shared-components";
import { TopicIcon } from "./topic-icon";
import type { StorySubject, StoryTemplateProps } from "./types";

const FALLBACK_COLOR = "#9CA3AF";

function SubjectCard({ subject }: { subject: StorySubject }) {
    const color = subject.topic?.colorHex || FALLBACK_COLOR;
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
            <div style={{ display: "flex", flexDirection: "column", flex: 1, marginRight: 16, minWidth: 0 }}>
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
                        wordBreak: "break-word",
                    }}
                >
                    {subject.name}
                </span>
            </div>
            {/* Right: colored circle with topic icon */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    background: color,
                    flexShrink: 0,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color="#FFFFFF" size={36} />
            </div>
        </div>
    );
}

export function renderCardsStory(props: StoryTemplateProps) {
    const remaining = Math.max(0, props.totalSubjectsCount - props.subjects.length);

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
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 48 }}>
                {props.cityLogoImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={props.cityLogoImage}
                        height={130}
                        alt=""
                        style={{ objectFit: "contain", marginRight: 40 }}
                    />
                )}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937" }}>
                        {props.cityName}
                    </span>
                    {props.adminBodyName && (
                        <span style={{ display: "flex", fontSize: 28, color: "#6B7280", marginTop: 4 }}>
                            {props.adminBodyName}
                        </span>
                    )}
                </div>
            </div>

            {/* Title */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 32 }}>
                <span style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    Συνεδρίαση
                </span>
                <span style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    {format(props.meetingDate, "dd.MM.yy")}
                </span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", alignItems: "center", color: "#4B5563", marginBottom: 36 }}>
                <span style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>
                    Συζητήθηκαν {props.totalSubjectsCount} θέματα
                </span>
            </div>

            {/* Subject cards (top 3, wrapping grid) */}
            {props.subjects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            gap: 16,
                        }}
                    >
                        {props.subjects.map((s) => (
                            <SubjectCard key={s.id} subject={s} />
                        ))}
                    </div>
                    {remaining > 0 && (
                        <div style={{ display: "flex", color: "#6B7280", fontSize: 28, marginTop: 18 }}>
                            <span style={{ display: "flex" }}>+ {remaining} ακόμα θέματα</span>
                        </div>
                    )}
                </div>
            )}

            <OpenCouncilWatermark logoOnly size={96} bottom={48} right={48} />
        </div>
    );
}
