/**
 * Πρότυπο τεχνικής περιγραφής — .docx generator.
 *
 * Produces the technical-description document municipalities need for their
 * procurement file, filled from an Offer. Conditional sections toggle on
 * offer flags and the budget table shows VAT-inclusive totals.
 *
 * The descriptive sections (buildTechnicalSectionChildren) are shared with
 * the Τεχνική Προσφορά document.
 *
 * Flag derivations:
 *   includesLivestreaming   = physical presence hours > 0
 *   includesEquipmentRental = equipment name/description present
 *   includesCorrectness     = correctness guarantee with hours > 0
 *
 * Discount note: procurement documents show no discount line — unit prices
 * are post-discount (see getOfferProcurementLines), so line totals and the
 * final total match the contracted amount.
 */
import {
    AlignmentType,
    Document,
    LevelFormat,
    PageBreak,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
} from "docx";
import type { Offer } from "@prisma/client";
import { downloadBlob } from "@/lib/utils/download";
import { calculateOfferTotals } from "@/lib/pricing";
import {
    deriveOfferCpv,
    getOfferProcurementLines,
    offerHasEquipment,
    offerHasPhysicalPresence,
    type ProcurementLine,
} from "@/lib/offers/display";
import { formatDate } from "@/lib/utils";
import { body, bullet, eur, h1, h2, h3, round2, SIZE } from "./shared";

const VAT_RATE = 0.24;

// ─── Budget table ───────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<ProcurementLine["key"], string> = {
    presence: "Μαγνητοσκόπηση και ζωντανή μετάδοση",
    equipment: "Ενοικίαση εξοπλισμού",
    ingestion: "Ψηφιοποίηση συνεδριάσεων",
    platform: "Παροχή διαδικτυακής πλατφόρμας",
    correctness: "Έλεγχος απομαγνητοφωνήσεων από άνθρωπο",
};

// Column widths in DXA — must sum to the table width (A4 content ≈ 9026).
const COL_WIDTHS = [2626, 1300, 900, 1050, 1050, 1050, 1050];
const TABLE_WIDTH = COL_WIDTHS.reduce((a, b) => a + b, 0);

function cell(
    text: string,
    opts: { bold?: boolean; header?: boolean; right?: boolean; width: number }
) {
    return new TableCell({
        width: { size: opts.width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: opts.header ? { type: ShadingType.CLEAR, fill: "F2F2F2" } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
            new Paragraph({
                alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [
                    new TextRun({ text, size: SIZE.SMALL, bold: opts.bold || opts.header }),
                ],
            }),
        ],
    });
}

/** Budget table with ΦΠΑ columns, shared column model with Οικονομική. */
/**
 * Budget table for procurement documents.
 *
 * Per-line figures are presentational: unit prices are shown post-discount,
 * rounded to the cent, and each row multiplies out. The Σύνολα row, however,
 * comes from `subtotal` — pass `calculateOfferTotals(offer).total` — so the
 * legally-binding totals always equal the negotiated amount on the offer
 * letter to the cent, even when discounted unit prices don't round exactly
 * (per-line double-rounding can otherwise drift by cents).
 */
export function buildBudgetTable(
    lines: ProcurementLine[],
    labels: Record<ProcurementLine["key"], string>,
    opts: { includePilotRow?: boolean; subtotal: number }
): {
    table: Table;
    subtotal: number;
    vat: number;
    totalWithVat: number;
} {
    const { includePilotRow = true, subtotal: authoritativeSubtotal } = opts;
    const headers = ["Είδος", "Μονάδα", "Ποσότητα", "Κόστος", "Σύνολο", "ΦΠΑ 24%", "Σύνολο με ΦΠΑ"];
    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map((t, i) =>
            cell(t, { header: true, width: COL_WIDTHS[i], right: i >= 2 })
        ),
    });

    const dataRows = lines.map((line) => {
        const vat = round2(line.total * VAT_RATE);
        return new TableRow({
            children: [
                cell(labels[line.key], { width: COL_WIDTHS[0] }),
                cell(line.unitLabel, { width: COL_WIDTHS[1] }),
                cell(String(line.qty), { width: COL_WIDTHS[2], right: true }),
                cell(eur(line.unitPrice), { width: COL_WIDTHS[3], right: true }),
                cell(eur(line.total), { width: COL_WIDTHS[4], right: true }),
                cell(eur(vat), { width: COL_WIDTHS[5], right: true }),
                cell(eur(round2(line.total + vat)), { width: COL_WIDTHS[6], right: true }),
            ],
        });
    });

    // Pilot features row — always €0, signals they're bundled.
    const pilotRow = new TableRow({
        children: [
            cell("Πιλοτικές λειτουργίες, επιπλέον προδιαγραφές και υπηρεσίες", {
                width: COL_WIDTHS[0],
            }),
            cell("Όπως περιγράφονται", { width: COL_WIDTHS[1] }),
            cell("—", { width: COL_WIDTHS[2], right: true }),
            cell("—", { width: COL_WIDTHS[3], right: true }),
            cell(eur(0), { width: COL_WIDTHS[4], right: true }),
            cell(eur(0), { width: COL_WIDTHS[5], right: true }),
            cell(eur(0), { width: COL_WIDTHS[6], right: true }),
        ],
    });

    const subtotal = round2(authoritativeSubtotal);
    const vatTotal = round2(subtotal * VAT_RATE);
    const totalWithVat = round2(subtotal + vatTotal);
    const totalRow = new TableRow({
        children: [
            cell("Σύνολα", { bold: true, width: COL_WIDTHS[0] }),
            cell("", { width: COL_WIDTHS[1] }),
            cell("", { width: COL_WIDTHS[2] }),
            cell("", { width: COL_WIDTHS[3] }),
            cell(eur(subtotal), { bold: true, width: COL_WIDTHS[4], right: true }),
            cell(eur(vatTotal), { bold: true, width: COL_WIDTHS[5], right: true }),
            cell(eur(totalWithVat), { bold: true, width: COL_WIDTHS[6], right: true }),
        ],
    });

    return {
        table: new Table({
            width: { size: TABLE_WIDTH, type: WidthType.DXA },
            columnWidths: COL_WIDTHS,
            rows: [
                headerRow,
                ...dataRows,
                ...(includePilotRow ? [pilotRow] : []),
                totalRow,
            ],
        }),
        subtotal,
        vat: vatTotal,
        totalWithVat,
    };
}

// ─── Descriptive sections (shared with Τεχνική Προσφορά) ────────────────────

export function buildTechnicalSectionChildren(offer: Offer): Paragraph[] {
    const totals = calculateOfferTotals(offer);
    const includesLivestreaming = offerHasPhysicalPresence(offer);
    const includesEquipmentRental = offerHasEquipment(offer);
    const includesCorrectness = offer.correctnessGuarantee && totals.hoursToGuarantee > 0;
    const startInFuture = offer.startDate > new Date();

    return [
        // ── Intro ──
        h1("Τεχνική Περιγραφή"),
        body(
            "Αυτή η τεχνική περιγραφή αφορά την χρήση καινοτόμου διαδικτυακού πληροφοριακού συστήματος Ψηφιοποίησης Συνεδριάσεων Συλλογικών Οργάνων (π.χ. Δημοτικά Συμβούλια), με σκοπό την καλύτερη και ευκολότερη ενημέρωση των δημοτών για τις συζητήσεις των δημοτικών συμβουλίων, καθώς και τη διευκόλυνση των αιρετών και δημοτικών υπαλλήλων στο έργο τους."
        ),
        body("Το πληροφοριακό σύστημα περιλαμβάνει:"),
        ...(includesLivestreaming
            ? [bullet("Τη μαγνητοσκόπηση και ζωντανή μετάδοση των συνεδριάσεων στο διαδίκτυο.")]
            : []),
        ...(includesEquipmentRental
            ? [bullet("Την ενοικίαση εξοπλισμού (κάμερες, μικρόφωνα και λοιπός εξοπλισμός συνεδριάσεων).")]
            : []),
        bullet("Την ψηφιοποίηση συνεδριάσεων."),
        bullet("Την παροχή διαδικτυακής πλατφόρμας."),
        bullet("Τις προσωποποιημένες ενημερώσεις δημοτών για θέματα της δημοτικής ατζέντας."),
        ...(includesCorrectness
            ? [bullet("Τον έλεγχο των απομαγνητοφωνήσεων από άνθρωπο.")]
            : []),
        bullet("Πιλοτικές λειτουργίες."),
        bullet("Επιπλέον προδιαγραφές και υπηρεσίες."),

        // ── Livestreaming ──
        ...(includesLivestreaming
            ? [
                  h2("Μαγνητοσκόπηση και ζωντανή μετάδοση"),
                  body(
                      `Η μαγνητοσκόπηση και ζωντανή μετάδοση θα καλύπτει έως ${offer.physicalPresenceHours} ώρες συνεδριάσεων κατά τη διάρκεια της σύμβασης.`
                  ),
                  bullet("Ήχος + βίντεο, καλύπτοντας όλη τη διάρκεια της συνεδρίασης."),
                  bullet("Αρχείο mp4 διαθέσιμο στο δήμο μέσω της πλατφόρμας ή κατόπιν αιτήματος μέσω email."),
                  bullet(
                      "Ζωντανή μετάδοση σε διαδικτυακή πλατφόρμα (π.χ. YouTube, Facebook), σε κανάλι του δήμου, με ελεύθερη πρόσβαση."
                  ),
                  bullet("Ποιότητα τουλάχιστον 720p και 30 FPS (εφόσον το επιτρέπει η σύνδεση)."),
                  bullet("Κάλυψη όλων των θέσεων ομιλίας με κοντινά πλάνα στους ομιλούντες."),
                  ...(!includesEquipmentRental
                      ? [
                            bullet(
                                "Ευθύνη του αναδόχου για την επιλογή, εγκατάσταση, λειτουργία, συντήρηση και τεχνική υποστήριξη του εξοπλισμού (κάμερες, καλώδια, σύνδεση με το σύστημα μικροφώνων), καθώς και ευθύνη για τυχόν βλάβες ή κλοπές."
                            ),
                            bullet(
                                "Συντήρηση μικροφώνων από τον δήμο: ο δήμος οφείλει να συντηρεί το σύστημα μικροφώνων που υπάρχει στην αίθουσα και την ασύρματη σύνδεση στο διαδίκτυο."
                            ),
                        ]
                      : [
                            bullet(
                                "Σύνδεση στο διαδίκτυο: ο δήμος οφείλει να παρέχει σταθερή σύνδεση στο διαδίκτυο (Wi-Fi) στην αίθουσα συνεδριάσεων."
                            ),
                        ]),
                  bullet(
                      "Δια ζώσης παρουσία αναδόχου τουλάχιστον 30 λεπτά πριν την έναρξη κάθε συνεδρίασης, παραμένοντας μέχρι το πέρας της."
                  ),
                  bullet("Κάλυψη διαδικτυακών και υβριδικών συνεδριάσεων."),
                  bullet(
                      "Προβολή διαφανειών ή άλλου οπτικοακουστικού υλικού κατά τη διάρκεια της συνεδρίασης, μετά από ενημέρωση."
                  ),
                  bullet("Κρυπτογραφημένη μετάδοση, ασφαλής αποθήκευση, backups."),
                  bullet(
                      "GDPR: ο ανάδοχος λειτουργεί ως Εκτελών την Επεξεργασία (Data Processor) και ο δήμος ως Υπεύθυνος Επεξεργασίας (Data Controller). Λεπτομέρειες στην ενότητα GDPR."
                  ),
              ]
            : []),

        // ── Equipment rental ──
        ...(includesEquipmentRental
            ? [
                  h2("Ενοικίαση εξοπλισμού"),
                  ...(offer.equipmentRentalName ? [body(offer.equipmentRentalName, { bold: true })] : []),
                  ...(offer.equipmentRentalDescription ? [body(offer.equipmentRentalDescription)] : []),
                  body(`Η ενοικίαση καλύπτει τη διάρκεια της σύμβασης (${totals.months} μήνες).`),
                  bullet("Εγκατάσταση, συντήρηση και τεχνική υποστήριξη του εξοπλισμού από τον ανάδοχο."),
                  bullet(
                      "Σε περίπτωση βλάβης, ο ανάδοχος αναλαμβάνει την επισκευή ή αντικατάσταση εντός εύλογου χρονικού διαστήματος."
                  ),
                  bullet(
                      "Κυριότητα: ο εξοπλισμός παραμένει ιδιοκτησία του αναδόχου και επιστρέφεται στο τέλος της σύμβασης."
                  ),
              ]
            : []),

        // ── Digitization ──
        h2("Ψηφιοποίηση συνεδριάσεων"),
        body(
            `Η ψηφιοποίηση καλύπτει έως ${offer.hoursToIngest} ώρες συνεδριάσεων κατά τη διάρκεια της σύμβασης.`
        ),
        bullet("Αυτόματη απομαγνητοφώνηση και αναγνώριση ομιλητών από το βίντεο και τον ήχο."),
        bullet("Παραγωγή συνόψεων από τις τοποθετήσεις των συμμετεχόντων."),
        bullet("Αναγνώριση θεμάτων και σύνδεση με την ημερήσια διάταξη."),
        bullet("Εξαγωγή τοποθεσίας για τα θέματα που αφορούν συγκεκριμένη περιοχή."),
        bullet("Μετατροπή υλικού σε MP4, MP3 και adaptive bitrate streaming."),
        bullet("Αυτόματη μεταφόρτωση στη διαδικτυακή πλατφόρμα."),
        bullet("Ολοκλήρωση εώς και 12 ώρες αφότου το αρχικό υλικό γίνει διαθέσιμο."),

        // ── Platform ──
        h2("Παροχή διαδικτυακής πλατφόρμας"),
        bullet("Διαθεσιμότητα από όλες τις σύγχρονες συσκευές και κινητά."),
        bullet("Ανοιχτό API για όλα τα δημόσια δεδομένα."),
        bullet("Πρόσβαση στις ψηφιοποιημένες συνεδριάσεις (απομαγνητοφώνηση, θέματα, συνόψεις)."),
        bullet("Διαδραστικός χάρτης θεμάτων με δυνατότητα pan και zoom."),
        bullet("Στατιστικά χρόνων ομιλίας και θεματολογίας."),
        bullet("Εξαγωγή απομαγνητοφώνησης σε PDF ή DOCX."),
        bullet("Σελίδες παρατάξεων και ομιλητών με στατιστικά και πρόσφατες τοποθετήσεις."),
        bullet("Αναζήτηση θεμάτων."),
        bullet("Adaptive bitrate streaming για όλο το οπτικοακουστικό υλικό."),
        bullet(
            "Αυτόματη παραγωγή υλικού για social media μετά από κάθε συνεδρίαση (σύντομα βίντεο και κείμενα με τα σημαντικότερα σημεία κάθε θέματος, έτοιμα για δημοσίευση)."
        ),
        bullet("Hosting σε cloud servers στην ΕΕ."),
        bullet("Subdomain του δήμου."),

        // ── Notifications ──
        h2("Προσωποποιημένες ενημερώσεις δημοτών"),
        body(
            "Η πλατφόρμα παρέχει σύστημα προσωποποιημένων ενημερώσεων προς τους δημότες, για τα θέματα της δημοτικής ατζέντας που τους αφορούν."
        ),
        bullet(
            "Δυνατότητα εγγραφής δημοτών δίνοντας στοιχεία επικοινωνίας (τηλέφωνο ή email) και λίστα περιοχών/θεματικών που τους αφορούν."
        ),
        bullet(
            "Εξαγωγή θεμάτων που αφορούν τον κάθε δημότη ξεχωριστά, από την ημερήσια διάταξη και την απομαγνητοφώνηση."
        ),
        bullet(
            "Αποστολή προσωποποιημένων μηνυμάτων μέσω email, SMS ή WhatsApp, πριν και μετά από κάθε συνεδρίαση."
        ),
        bullet("Σελίδα διαχείρισης ενημερώσεων για τους δημότες (επεξεργασία προτιμήσεων, απεγγραφή)."),

        // ── Correctness ──
        ...(includesCorrectness
            ? [
                  h2("Έλεγχος απομαγνητοφωνήσεων από άνθρωπο"),
                  body(
                      "Η αυτόματη απομαγνητοφώνηση που πραγματοποιείται κατά τη ψηφιοποίηση συνεδριάσεων ελέγχεται και διορθώνεται από εξειδικευμένο προσωπικό του αναδόχου, με σκοπό το να είναι κατάλληλη για τα πρακτικά του δήμου."
                  ),
                  bullet("Διόρθωση εντός 36 ωρών μετά τη διαθεσιμότητα του υλικού."),
                  bullet("Όλες οι διορθώσεις ορατές στη διαδικτυακή πλατφόρμα."),
                  bullet(`Καλύπτονται έως ${totals.hoursToGuarantee} ώρες κατά τη διάρκεια της σύμβασης.`),
              ]
            : []),

        // ── Pilot features ──
        h2("Πιλοτικές λειτουργίες"),
        body(
            "Επιπλέον, προδιαγράφονται ενδεικτικά οι παρακάτω πιλοτικές λειτουργίες, οι οποίες θα ενεργοποιηθούν μετά τη συγκατάθεση του δήμου, και σε χρόνο που βολεύει τον ανάδοχο και το δήμο, και για τις οποίες δε θα προκύπτει καμία επιπλέον χρέωση."
        ),
        h3("Διαβουλεύσεις κανονιστικών πράξεων"),
        bullet(
            "Λειτουργία διαβούλευσης για κανονιστικές πράξεις του δήμου, με δημόσια σχόλια ανά άρθρο και κεφάλαιο."
        ),
        bullet("Αυτόματες συνόψεις ανά κεφάλαιο και άρθρο."),
        bullet("Διαδραστικός χάρτης για τοποθεσίες της κανονιστικής, με δυνατότητα σχολίων ανά τοποθεσία."),
        bullet("Δημοσίευση σχολίων στην πλατφόρμα και αποστολή σε email του δήμου."),

        // ── Extra provisions ──
        h2("Επιπλέον προδιαγραφές και υπηρεσίες"),
        bullet(
            "Άδεια ανοιχτού κώδικα για την πλατφόρμα, που επιτρέπει εμπορική χρήση. Πηγαίος κώδικας στο GitHub."
        ),
        bullet("Ανοιχτά δεδομένα για όλα τα δημόσια δεδομένα της πλατφόρμας, σε κοινά αποδεκτή μορφή."),
        includesCorrectness
            ? bullet(
                  "Αποστολή της τελικής διορθωμένης απομαγνητοφώνησης σε email που υποδείξει ο δήμος, μετά από κάθε συνεδρίαση, σε μορφή .docx."
              )
            : bullet(
                  "Αποστολή της απομαγνητοφώνησης κάθε συνεδρίασης σε email που υποδείξει ο δήμος, σε μορφή .docx."
              ),
        bullet("Τεχνική υποστήριξη για αιρετούς, υπαλλήλους και δημότες, μέσω τηλεφώνου ή email."),
        bullet("Απομαγνητοφωνήσεις σε έντυπη μορφή ή USB/CD, έως 2 φορές το χρόνο, μετά από αίτημα."),

        // ── GDPR ──
        h2("Συμμόρφωση με το Γενικό Κανονισμό Προστασίας Δεδομένων"),
        ...(!includesLivestreaming
            ? [
                  body(
                      "Η ανάδοχος εταιρεία θα λειτουργεί ως Υπεύθυνος Επεξεργασίας (Data Controller), τόσο για την επεξεργασία των συνεδριάσεων, όσο και για την εγγραφή των χρηστών στη διαδικτυακή πλατφόρμα. Θα τηρεί όλες τις υποχρεώσεις του GDPR, και θα είναι υπεύθυνη για τη διαχείριση των υποκειμένων δεδομένων."
                  ),
              ]
            : [
                  body("Ο ανάδοχος έχει διπλό ρόλο υπό το Γενικό Κανονισμό Προστασίας Δεδομένων (GDPR):"),
                  body("1. Για το τμήμα της μαγνητοσκόπησης και ζωντανής μετάδοσης:", { bold: true }),
                  body(
                      "Η ανάδοχος εταιρεία λειτουργεί ως Εκτελών την Επεξεργασία (Data Processor), και ο δήμος ως Υπεύθυνος Επεξεργασίας (Data Controller). Ο ανάδοχος θα:"
                  ),
                  bullet("Υπογράψει με το δήμο Σύμβαση Επεξεργασίας Προσωπικών Δεδομένων (άρθρο 28 GDPR)."),
                  bullet("Εφαρμόσει τα απαιτούμενα τεχνικά και οργανωτικά μέτρα ασφαλείας."),
                  bullet(
                      "Συνεργαστεί με το δήμο για την Εκτίμηση Αντικτύπου Προστασίας Δεδομένων, αν αυτή κριθεί απαραίτητη."
                  ),
                  body("2. Για το τμήμα της ψηφιοποίησης και της παροχής διαδικτυακής πλατφόρμας:", {
                      bold: true,
                  }),
                  body(
                      "Ο ανάδοχος λειτουργεί ως Υπεύθυνος Επεξεργασίας (Data Controller) με κύρια νομική βάση το έννομο συμφέρον για τη βελτίωση της διαφάνειας των δημόσιων αποφάσεων. Ο ανάδοχος θα:"
                  ),
                  bullet("Τηρήσει όλες τις υποχρεώσεις του GDPR για υπεύθυνους επεξεργασίας."),
                  bullet("Διαχειριστεί τα δικαιώματα των υποκειμένων δεδομένων."),
              ]),

        // ── Duration ──
        h2("Διάρκεια"),
        startInFuture
            ? body(
                  `Ως ημερομηνία έναρξης της σύμβασης ορίζεται η ${formatDate(offer.startDate)}, και η σύμβαση έχει διάρκεια ${totals.months} μηνών (έως ${formatDate(offer.endDate)}). Όλες οι προδιαγραφόμενες υπηρεσίες μπορούν να χρησιμοποιηθούν μέχρι τη λήξη της σύμβασης ή μέχρι εξαντλήσεως τους.`
              )
            : body(
                  `Ως ημερομηνία έναρξης της σύμβασης ορίζεται η ημέρα υπογραφής της, και η σύμβαση έχει διάρκεια ${totals.months} μηνών. Όλες οι προδιαγραφόμενες υπηρεσίες μπορούν να χρησιμοποιηθούν μέχρι τη λήξη της σύμβασης ή μέχρι εξαντλήσεως τους.`
              ),
    ];
}

// ─── Shared Document assembly options ───────────────────────────────────────

export const DOC_NUMBERING = {
    config: [
        {
            reference: "tech-bullets",
            levels: [
                {
                    level: 0,
                    format: LevelFormat.BULLET,
                    text: "•",
                    alignment: AlignmentType.LEFT,
                    style: {
                        paragraph: {
                            indent: { left: 504, hanging: 259 },
                        },
                    },
                },
            ],
        },
    ],
};

export const DOC_STYLES = {
    default: {
        document: { run: { size: SIZE.BODY } },
        heading1: { run: { size: 30, bold: true, color: "000000" } },
        heading2: { run: { size: 26, bold: true, color: "000000" } },
        heading3: { run: { size: 23, bold: true, color: "000000" } },
    },
};

// ─── Document ───────────────────────────────────────────────────────────────

export function buildTechnicalDescriptionDoc(offer: Offer): Document {
    const lines = getOfferProcurementLines(offer);
    const { table, totalWithVat } = buildBudgetTable(lines, BUDGET_LABELS, {
        subtotal: calculateOfferTotals(offer).total,
    });
    const cpv = deriveOfferCpv(offer);

    const cover: Paragraph[] = [
        new Paragraph({ spacing: { before: 2400 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
                new TextRun({
                    text: "Διαδικτυακό Πληροφοριακό Σύστημα Ψηφιοποίησης Συνεδριάσεων Συλλογικών Οργάνων",
                    size: SIZE.COVER_TITLE,
                    bold: true,
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: "Τεχνική Περιγραφή", size: SIZE.COVER_SUB })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: `CPV: ${cpv}`, size: SIZE.COVER_SUB })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 720 },
            children: [
                new TextRun({
                    text: `Συνολικός Προϋπολογισμός ${eur(totalWithVat)} (συμπ. ΦΠΑ)`,
                    size: SIZE.COVER_SUB,
                    bold: true,
                }),
            ],
        }),
        new Paragraph({ children: [new PageBreak()] }),
    ];

    return new Document({
        creator: "OpenCouncil",
        title: `Τεχνική Περιγραφή — ${offer.recipientName}`,
        numbering: DOC_NUMBERING,
        styles: DOC_STYLES,
        sections: [
            {
                properties: {},
                children: [
                    ...cover,
                    ...buildTechnicalSectionChildren(offer),
                    h2("Προϋπολογισμός"),
                    table,
                    h2("Πληρωμή"),
                    body("Η πληρωμή θα γίνει σε δύο ισόποσες δόσεις."),
                ],
            },
        ],
    });
}

/** Generate the document and trigger a browser download. */
export async function downloadTechnicalDescription(offer: Offer): Promise<void> {
    const doc = buildTechnicalDescriptionDoc(offer);
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `Τεχνική Περιγραφή - ${offer.recipientName}.docx`);
}
