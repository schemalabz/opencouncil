import { Document, Page, View, Text } from "@react-pdf/renderer";
import { Brand, C } from "@/components/pdf/shared";
import { REGISTRY_ITEMS, REGISTRY_LAW, REGISTRY_VERSION } from "@/lib/explain/registry";
import { formatDate } from "@/lib/formatters/time";

/**
 * The registry declaration as a document a municipality can file: the eleven
 * items of άρθρο 21 παρ. 3 ν. 5321/2026 with OpenCouncil's answers, dated and
 * versioned. Same data as the page, so the two never disagree. Rendered in
 * the browser on download, like the brochure.
 */
export function RegistryDeclarationPdf({ baseUrl }: { baseUrl: string }) {
    const version = formatDate(new Date(REGISTRY_VERSION));
    return (
        <Document title="OpenCouncil: στοιχεία για το Μητρώο συστημάτων ΤΝ" language="el">
            <Page size="A4" style={{ fontFamily: "Inter", padding: "48 52 56", color: C.body, fontSize: 9.5 }}>
                {/* lockup sized like the brochure's: the butterfly's strokes read as heavy as the text */}
                <View fixed style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
                    <Brand size={44} textScale={0.335} />
                    <Text style={{ fontSize: 8.5, color: C.light }}>Έκδοση {version}</Text>
                </View>

                <Text style={{ fontSize: 17, fontWeight: 600, color: C.ink, lineHeight: 1.25, marginBottom: 10 }}>
                    Στοιχεία για τη δήλωση του OpenCouncil στο {REGISTRY_LAW.registry}
                </Text>
                <Text style={{ fontSize: 9.5, lineHeight: 1.45, marginBottom: 4 }}>
                    Το {REGISTRY_LAW.article} παρ. 3 του {REGISTRY_LAW.law} ({REGISTRY_LAW.gazette}) ζητά έντεκα
                    πράγματα για κάθε σύστημα. Εδώ είναι οι απαντήσεις της OpenCouncil. Το μόνο επιπλέον πράγμα που πρέπει να
                    γνωρίζετε και διαφοροποιείται ανά δήμο είναι το χρονοδιάγραμμα του έργου, δηλαδή η περίοδος ισχύος της
                    σύμβασης του OpenCouncil με τον Δήμο. Αρμόδιος είναι {REGISTRY_LAW.responsible} ({REGISTRY_LAW.article} παρ. 4).
                </Text>
                <Text style={{ fontSize: 9.5, lineHeight: 1.45, marginBottom: 16 }}>
                    Για σύστημα που ήδη λειτουργεί, η προθεσμία είναι η {formatDate(new Date(REGISTRY_LAW.deadline))} (
                    {REGISTRY_LAW.deadlineArticle}). Το Μητρώο τηρεί η {REGISTRY_LAW.keeper}.
                </Text>

                {REGISTRY_ITEMS.map((item) => (
                    <View key={item.letter} minPresenceAhead={40} style={{ flexDirection: "row", borderTop: `1 solid ${C.line}`, paddingVertical: 8 }}>
                        <View style={{ width: 150, paddingRight: 12 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
                                {item.letter}) {item.question}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            {item.answer.map((line) => (
                                <Text key={line} style={{ fontSize: 9.5, lineHeight: 1.45, marginBottom: 3 }}>
                                    {line}
                                </Text>
                            ))}
                        </View>
                    </View>
                ))}

                <View style={{ borderTop: `1 solid ${C.line}`, paddingTop: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 8, color: C.mid, lineHeight: 1.45 }}>
                        Το έγγραφο αλλάζει όποτε αλλάζει ο τρόπος που δουλεύει το OpenCouncil. Η ισχύουσα έκδοση και το ιστορικό
                        αλλαγών βρίσκονται στο {baseUrl}/explain#oc-ai. Ερωτήσεις: hello@opencouncil.gr.
                    </Text>
                </View>

                <Text
                    fixed
                    style={{ position: "absolute", bottom: 28, left: 52, right: 52, fontSize: 7.5, color: C.light, textAlign: "right" }}
                    render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                />
            </Page>
        </Document>
    );
}
