/**
 * The claim QR codes of a council as strips to cut: one per person, with
 * the QR, the name and the role, a scan hint and a "personal, do not share"
 * warning. A dashed line with scissors runs between strips. Meant to be
 * printed, cut and left on each desk, so every strip carries its own
 * warning and nothing that belongs to somebody else.
 *
 * Lazy-loaded by the sheet's download button, like the offer PDF.
 */
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { Brand, C, LucideIcon, QRCode } from "@/components/pdf/shared";
import type { QrStripPerson } from "@/lib/admin/councilQrStrips";

/** The strip texts, in the city's language: the reader is the councillor, not the admin. */
export interface QrStripLabels {
    scan: string;
    /** "Valid until …", with the date already written in the city's language. */
    validUntil: string;
    /** The caption of the box around the QR. */
    secretCode: string;
    /** The bold start of the warning ("Προσωπικό."). */
    privateLead: string;
    /** The rest of the warning, with `{name}` filled in per person by the caller. */
    private: (name: string) => string;
}

const QR_SIZE = 64;
// Wide enough for the caption on one line in every locale.
const QR_BOX_WIDTH = 96;
// The box (QR, caption, padding), the row's vertical padding and the cut line.
const STRIP_HEIGHT = 108;

function Strip({ person, labels }: { person: QrStripPerson; labels: QrStripLabels }) {
    return (
        <View wrap={false} style={{ height: STRIP_HEIGHT, flexDirection: "column" }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 6 }}>
                <View
                    style={{
                        width: QR_BOX_WIDTH,
                        alignItems: "center",
                        gap: 3,
                        paddingTop: 5,
                        paddingBottom: 4,
                        paddingHorizontal: 4,
                        borderWidth: 1,
                        borderColor: C.ink,
                        borderRadius: 4,
                    }}
                >
                    <QRCode value={person.joinUrl} size={QR_SIZE} />
                    <Text style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 5.5, color: C.ink, lineHeight: 1.2, textAlign: "center" }}>
                        {labels.secretCode}
                    </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 13, color: C.ink, lineHeight: 1.2 }}>
                        {person.name}
                    </Text>
                    {person.role && (
                        <Text style={{ fontFamily: "Inter", fontSize: 9, color: C.mid, lineHeight: 1.3 }}>{person.role}</Text>
                    )}
                    <Text style={{ fontFamily: "Inter", fontSize: 8, color: C.body, lineHeight: 1.3, marginTop: 2 }}>
                        {labels.scan}
                    </Text>
                    <Text style={{ fontFamily: "Inter", fontWeight: 500, fontSize: 7.5, color: C.mid, lineHeight: 1.3 }}>
                        {labels.validUntil}
                    </Text>
                </View>
                <View
                    style={{
                        width: 168,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        padding: 7,
                        borderRadius: 4,
                        backgroundColor: C.accentSoft,
                    }}
                >
                    <LucideIcon name="triangleAlert" size={14} />
                    <Text style={{ flex: 1, fontFamily: "Inter", fontWeight: 500, fontSize: 7.5, color: C.body, lineHeight: 1.3 }}>
                        <Text style={{ fontWeight: 700, color: C.ink }}>{labels.privateLead}</Text> {labels.private(person.name)}
                    </Text>
                </View>
            </View>
            {/* The cut line: dashed, with scissors at its start. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <LucideIcon name="scissors" size={9} color={C.light} />
                <View style={{ flex: 1, borderBottomWidth: 0.8, borderBottomColor: C.light, borderBottomStyle: "dashed" }} />
            </View>
        </View>
    );
}

export function CouncilQrStripsPdf({
    cityName,
    people,
    labels,
}: {
    cityName: string;
    people: QrStripPerson[];
    labels: QrStripLabels;
}) {
    return (
        <Document title={`OpenCouncil · ${cityName}`} author="OpenCouncil" subject={cityName}>
            <Page size="A4" style={{ paddingTop: 28, paddingBottom: 34, paddingHorizontal: 32, fontFamily: "Inter" }}>
                <View fixed style={{ marginBottom: 10 }}>
                    <Brand size={14} />
                </View>
                {people.map((person) => (
                    <Strip key={person.id} person={person} labels={labels} />
                ))}
                <Text
                    fixed
                    style={{ position: "absolute", bottom: 16, right: 32, fontSize: 7, color: C.light }}
                    render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                />
            </Page>
        </Document>
    );
}
