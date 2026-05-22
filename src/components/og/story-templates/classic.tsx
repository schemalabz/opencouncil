// T1 — Classic: cream background, large header, big date title, simple subject list with topic-color circles.

import { format } from "date-fns";
import { OpenCouncilWatermark } from "../shared-components";
import { TopicIcon } from "./topic-icon";
import type { StoryTemplateProps } from "./types";

const FALLBACK_COLOR = "#9CA3AF";

export function renderClassicStory(props: StoryTemplateProps) {
    const remaining = Math.max(0, props.totalSubjectsCount - props.subjects.length);
    const weekday = props.meetingDate.toLocaleDateString("el-GR", { weekday: "long" });

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
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 52 }}>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    Συνεδρίαση
                </span>
                <span style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111827", lineHeight: 1.05 }}>
                    {format(props.meetingDate, "dd.MM.yy")}
                </span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", color: "#4B5563", fontSize: 40, marginBottom: 56 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📅</span>
                    <span style={{ display: "flex" }}>{weekday}, {props.formattedDate}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ display: "flex", marginRight: 10 }}>📋</span>
                    <span style={{ display: "flex" }}>{props.totalSubjectsCount} θέματα</span>
                </div>
            </div>

            {/* Subjects (top 3) */}
            {props.subjects.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {props.subjects.map((s) => {
                        const color = s.topic?.colorHex || FALLBACK_COLOR;
                        return (
                            <div
                                key={s.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "16px 20px",
                                    background: "#FFFFFF",
                                    border: "1px solid rgba(0,0,0,0.05)",
                                    borderRadius: 16,
                                    marginBottom: 12,
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
                                    <TopicIcon name={s.topic?.icon} color="#FFFFFF" size={28} />
                                </div>
                                {/* flex: 1 + minWidth: 0 lets long subject names wrap inside the card. */}
                                <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                                    <span
                                        style={{
                                            display: "flex",
                                            color: "#1F2937",
                                            fontSize: 32,
                                            fontWeight: 600,
                                            lineHeight: 1.2,
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {s.name}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
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
