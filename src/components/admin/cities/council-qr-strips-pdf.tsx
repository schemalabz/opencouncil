/**
 * The claim QR codes of a city as cards to cut: six to an A4 page, in a grid
 * of two columns and three rows (see qrSheetLayout). Each card holds the
 * brand and the city; the QR with the name and the role beside it; a scan
 * hint under them that ends with the date the code expires; and a
 * "personal, do not share" warning. A card leaves the
 * page and is left on one desk, so it carries everything it needs and
 * nothing that belongs to somebody else.
 *
 * Every page puts its cards in the same places, so a stack of pages is cut
 * through at once along the dashed lines. Text keeps about 7 mm from each
 * card edge: a cut a little off clips nothing, and the edge a printer cannot
 * reach stays empty.
 *
 * Lazy-loaded by the sheet's download button, like the offer PDF.
 */
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { Brand, C, LucideIcon, QRCode } from "@/components/pdf/shared";
import type { QrStripPerson } from "@/lib/admin/councilQrStrips";
import { CUTS, SHEET_HEIGHT, SHEET_WIDTH, cardFrame, namePieces, toSheets } from "./qrSheetLayout";

/** The card texts, in the city's language: the reader is the councillor, not the admin. */
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

// About 40 mm: some three times the area of the old strip's 64 pt code.
const QR_SIZE = 112;
// Room for the caption on one line in every locale.
const QR_BOX_WIDTH = 128;
// About 7 mm from every cut; above the 4–5 mm a printer cannot reach.
const CARD_PADDING_X = 21;
const CARD_PADDING_Y = 20;

function Card({ person, cityName, labels }: { person: QrStripPerson; cityName: string; labels: QrStripLabels }) {
    return (
        <View
            style={{
                flex: 1,
                paddingHorizontal: CARD_PADDING_X,
                paddingVertical: CARD_PADDING_Y,
                flexDirection: "column",
                // The brand at the top and the warning at the bottom, so both
                // line up across the whole grid. Centring the stack instead
                // moves them with each card's text and the grid goes ragged.
                justifyContent: "space-between",
            }}
        >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Brand size={16} />
                <Text style={{ fontSize: 7.5, color: C.light }}>{cityName}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                    style={{
                        width: QR_BOX_WIDTH,
                        alignItems: "center",
                        gap: 3,
                        paddingTop: 6,
                        paddingBottom: 5,
                        paddingHorizontal: 4,
                        borderWidth: 1,
                        borderColor: C.ink,
                        borderRadius: 4,
                    }}
                >
                    <QRCode value={person.joinUrl} size={QR_SIZE} />
                    <Text style={{ fontWeight: 600, fontSize: 5.5, color: C.ink, lineHeight: 1.2, textAlign: "center" }}>
                        {labels.secretCode}
                    </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                    {/* A wrapping row of pieces, so a compound surname breaks after its hyphen (see namePieces). */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                        {namePieces(person.name).map((piece, i) => (
                            <Text key={i} style={{ fontWeight: 600, fontSize: 13, color: C.ink, lineHeight: 1.2, marginRight: piece.spaceAfter ? 3.5 : 0 }}>
                                {piece.text}
                            </Text>
                        ))}
                    </View>
                    {person.role && <Text style={{ fontSize: 9, color: C.mid, lineHeight: 1.3 }}>{person.role}</Text>}
                </View>
            </View>

            {/* On its own line, under the QR: beside it, the hint crowded the
                name and role into a narrow column and left the card's height
                unused. The expiry follows it, as the rest of the sentence:
                what to do, and until when. */}
            <Text style={{ fontSize: 8.5, color: C.body, lineHeight: 1.3 }}>
                {labels.scan} <Text style={{ fontWeight: 500, color: C.mid }}>{labels.validUntil}</Text>
            </Text>

            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 4,
                    backgroundColor: C.accentSoft,
                }}
            >
                <LucideIcon name="triangleAlert" size={13} />
                <Text style={{ flex: 1, fontWeight: 500, fontSize: 7.5, color: C.body, lineHeight: 1.3 }}>
                    <Text style={{ fontWeight: 700, color: C.ink }}>{labels.privateLead}</Text> {labels.private(person.name)}
                </Text>
            </View>
        </View>
    );
}

/** The dashed cut lines, with scissors at the start of each, the same on every page. */
function CutLines() {
    return (
        <>
            {CUTS.vertical.map((x) => (
                <View
                    key={`v${x}`}
                    style={{ position: "absolute", left: x, top: 0, height: SHEET_HEIGHT, borderLeftWidth: 0.6, borderLeftColor: C.light, borderLeftStyle: "dashed" }}
                />
            ))}
            {CUTS.horizontal.map((y) => (
                <View
                    key={`h${y}`}
                    style={{ position: "absolute", top: y, left: 0, width: SHEET_WIDTH, borderTopWidth: 0.6, borderTopColor: C.light, borderTopStyle: "dashed" }}
                />
            ))}
            {CUTS.vertical.map((x) => (
                <View key={`sv${x}`} style={{ position: "absolute", left: x - 5, top: 4, backgroundColor: "#ffffff" }}>
                    <LucideIcon name="scissors" size={10} color={C.light} />
                </View>
            ))}
            {CUTS.horizontal.map((y) => (
                <View key={`sh${y}`} style={{ position: "absolute", top: y - 5, left: 4, backgroundColor: "#ffffff" }}>
                    <LucideIcon name="scissors" size={10} color={C.light} />
                </View>
            ))}
        </>
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
    // One Page per six cards, each card at a fixed frame: a flowing layout
    // could shift a card between pages, and then a stack would not cut true.
    return (
        <Document title={`OpenCouncil · ${cityName}`} author="OpenCouncil" subject={cityName}>
            {toSheets(people).map((sheet, index) => (
                <Page key={index} size="A4" style={{ fontFamily: "Inter" }}>
                    {sheet.map((person, slot) => {
                        const frame = cardFrame(slot);
                        return (
                            <View key={person.id} style={{ position: "absolute", ...frame }}>
                                <Card person={person} cityName={cityName} labels={labels} />
                            </View>
                        );
                    })}
                    <CutLines />
                </Page>
            ))}
        </Document>
    );
}
