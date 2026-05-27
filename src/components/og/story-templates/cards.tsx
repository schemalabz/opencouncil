import { format } from "date-fns";
import { OpenCouncilWatermark } from "../shared-components";
import type { PreviewSubject, PreviewData } from "./types";
import { SectionLabel, RemainderLine, PRIMARY_PILL_FALLBACK, STORY_FONT_FAMILY, TopicIcon, uppercaseGreek } from "./shared";

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
            {/* Left: icon disc */}
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
                    marginRight: 18,
                }}
            >
                <TopicIcon name={subject.topic?.icon} color="#FFFFFF" size={36} />
            </div>
            {/* Right: text */}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                {subject.topic?.name && (
                    <span
                        style={{
                            display: "flex",
                            fontSize: 24,
                            fontWeight: 700,
                            color,
                            letterSpacing: "0.14em",
                            marginBottom: 10,
                        }}
                    >
                        {uppercaseGreek(subject.topic.name)}
                    </span>
                )}
                <span
                    style={{
                        display: "flex",
                        fontSize: 30,
                        fontWeight: 700,
                        color: "#1F2937",
                        lineHeight: 1.25,
                    }}
                >
                    {subject.name}
                </span>
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
    const { preAgenda, agenda, preAgendaShown, agendaShown, preAgendaRemaining, agendaRemaining } = data;

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
                fontFamily: STORY_FONT_FAMILY,
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
                    <span style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#1F2937", whiteSpace: "nowrap" }}>
                        {data.cityName}
                    </span>
                    <span style={{ display: "flex", fontSize: 32, color: "#6B7280", marginTop: 4, whiteSpace: "nowrap" }}>
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
                    fontSize: 32,
                    marginBottom: 36,
                }}
            >
                <span style={{ display: "flex", fontSize: 36, fontWeight: 800, whiteSpace: "nowrap" }}>{`Συζητήθηκαν ${data.totalSubjects} θέματα`}</span>
            </div>

            {/* Pre-agenda cards */}
            {preAgendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
                    <SectionLabel label="Προ ημερησίας συζήτηση" count={preAgenda.length} color="#6B7280" />
                    <SubjectCardGrid subjects={preAgendaShown} />
                </div>
            )}

            {preAgendaRemaining > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
                    <RemainderLine count={preAgendaRemaining} color="#6B7280" label="ακόμα θέματα προ ημερησίας συζήτησης" />
                </div>
            )}

            {/* Agenda cards */}
            {agendaShown.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <SectionLabel label="Ημερήσια διάταξη" count={agenda.length} color="#6B7280" />
                    <SubjectCardGrid subjects={agendaShown} />
                </div>
            )}

            {agendaRemaining > 0 && <RemainderLine count={agendaRemaining} color="#6B7280" label="ακόμα θέματα στην ημερήσια διάταξη" />}

            <OpenCouncilWatermark logoSrc={data.blackLogoSrc} logoOnly size={96} bottom={48} right={48} />
        </div>
    );
};
