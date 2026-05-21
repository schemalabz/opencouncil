import { format } from "date-fns";
import { OpenCouncilWatermark } from "../shared-components";
import type { PreviewSubject, PreviewData } from "./types";
import { SectionLabel, RemainderLine, TopicIcon, PRIMARY_PILL_FALLBACK } from "./shared";
import { getSubjectSections } from "./sections";

// Card showing one subject with its topic icon + color + name.
// Topic color drives the border + a very light tint of the background; icon sits on the right.
const SubjectCard = ({ subject }: { subject: PreviewSubject }) => {
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

const SubjectCardGrid = ({ subjects }: { subjects: PreviewSubject[] }) => (
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

// T3 — With Cards (cream / clean, T1 base with subject cards)
export const Template3WithCards = (data: PreviewData) => {
    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } =
        getSubjectSections(data.subjects, { preAgenda: 2, agenda: 4 });

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
                    {format(data.meetingDate, "dd.MM.yy")}
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
                        Προ ημερησίας συζήτηση
                    </SectionLabel>
                    <SubjectCardGrid subjects={preAgendaShown} />
                </div>
            )}

            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
                    {preAgendaRemaining > 0 && (
                        <RemainderLine count={preAgendaRemaining} color="#6B7280" label="ακόμα θέματα προ ημερησίας συζήτησης" />
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
