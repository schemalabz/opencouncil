import { ComponentType } from "react";
import { TikTokEmbed } from "@/components/embeds/TikTokEmbed";
import { ZoomableImage } from "@/components/embeds/ZoomableImage";
import { MunicipalitiesChart } from "@/components/explain/MunicipalitiesChart";
import { MunicipalFinanceChart } from "@/components/explain/MunicipalFinanceChart";
import { MunicipalityGovernance } from "@/components/explain/MunicipalityGovernance";
import { AgendaViewer } from "@/components/embeds/AgendaViewer";

/**
 * Content model for the single, scrollable /explain page.
 *
 * Each article is one section of the long-form page. `id` is the anchor used in
 * the URL hash (e.g. /explain#ellinikoi-dimoi), the sticky table of contents and
 * the mobile prev/next navigator. `title` is the section subtitle; `Body` is the
 * server-rendered prose (kept indexable — no client hooks).
 *
 * Prose is faithful to the OpenCouncil explainer; external references (Διαύγεια,
 * taxheaven, mitos, opencouncil.gr) link out via plain anchors.
 */
export interface ExplainArticle {
    id: string;
    title: string;
    Body: ComponentType;
}

/** External link helper — opens in a new tab, safe rel. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    );
}

/** Article image with an optional caption; `not-prose` so the caption/border stay ours. */
function Figure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
    return (
        <figure className="not-prose my-6">
            <ZoomableImage src={src} alt={alt} />
            {caption && <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption>}
        </figure>
    );
}

function EllinikoiDimoiBody() {
    return (
        <>
            <p>
                Στην Ελλάδα έχουμε <strong>332 δήμους</strong>, με μεγαλύτερο το Δήμο Αθηναίων με περίπου 640
                χιλιάδες κάτοικους και μικρότερο το Δήμο Γαύδου, με μόλις 142 μόνιμους κατοίκους. 16 δήμοι έχουν
                περισσότερους από 100 χιλιάδες κατοίκους, ενώ 50 έχουν λιγότερους από 5 χιλιάδες.
            </p>
            <p>Κάθε δήμος λειτουργεί ως μια μικρή τοπική κυβέρνηση με συγκεκριμένη δομή και αρμοδιότητες.</p>
            <p>
                Οι βασικές απ’ αυτές είναι η <strong>καθαριότητα</strong> και η{" "}
                <strong>διαχείριση απορριμμάτων,</strong> η συντήρηση κάποιων <strong>δρόμων</strong> και{" "}
                <strong>πεζοδρομίων,</strong> οι <strong>παιδικοί σταθμοί</strong> και τα{" "}
                <strong>σχολικά κτίρια,</strong> το <strong>πράσινο</strong> και οι{" "}
                <strong>κοινόχρηστοι χώροι,</strong> ο <strong>πολιτισμός</strong> και{" "}
                <strong>αθλητισμός,</strong> η <strong>κοινωνική πρόνοια</strong> και η{" "}
                <strong>αδειοδότηση καταστημάτων.</strong>
            </p>
            <MunicipalitiesChart />
        </>
    );
}

function EsodaDimonBody() {
    return (
        <>
            <p>Τα έσοδα των δήμων προέρχονται από τις εξής πηγές:</p>
            <ul>
                <li>
                    <strong>Κεντρικό κράτος</strong>: Οι Κεντρικοί Αυτοτελείς Πόροι (ΚΑΠ) αποτελούν τον κορμό των
                    εσόδων, με συμβολή <strong>~60% στα συνολικά έσοδα (2024).</strong> Σε αγροτικούς και ορεινούς
                    δήμους, η εξάρτηση από τους ΚΑΠ φτάνει το <strong>85-90%.</strong>
                </li>
                <li>
                    <strong>Τοπική φορολογία και τέλη</strong>: Για παράδειγμα, τα Τέλη Καθαριότητας/Φωτισμού.{" "}
                    <strong>Η τοπική φορολογική αυτοτέλεια στους ελληνικούς δήμους είναι μόνο 15-20%</strong>, που
                    αποτελεί πολύ μικρό ποσοστό αν συγκριθεί με το 35-50% στη Γερμανία ή το &gt;50% στις
                    Σκανδιναβικές χώρες. Μεγάλο μέρος των τελών και των φόρων ενός δήμου μένουν ανείσπρακτα: Για
                    παράδειγμα, ο <strong>Δημοτικός Φόρος Ηλεκτροδοτούμενων Χώρων (ΔΦΗΧ)</strong> εισπράττεται
                    μόνο κατά <strong>67%</strong> λόγω αναποτελεσματικών μηχανισμών ελέγχου.
                </li>
                <li>
                    <strong>Ευρωπαϊκές Πηγές:</strong> Ένα ~30% των εσόδων των δήμων προέρχεται από τα κρατικά
                    ταμεία. Για παράδειγμα, οι δήμοι απορροφούν 1.2 δισ. ευρώ ετησίως από ΕΣΠΑ/ΤΑΑ, αλλά με
                    μεγαλύτερη αποτελεσματικότητα σε μεγάλους αστικούς δήμους.
                </li>
            </ul>
            <p>
                Τα χρήματα που εισπράττουν οι δήμοι δαπανώνται κατά βάση σε μόνιμες δαπάνες, όπως η μισθοδοσία
                (~50% το 2024) και λειτουργικά έξοδα (~28% το 2024) για ενέργεια, καθαριότητα και συντήρηση
                υποδομών.
            </p>
            <MunicipalFinanceChart />
        </>
    );
}

function DioikisiDimouBody() {
    return (
        <>
            <p>
                Τα τρία βασικά όργανα ενός δήμου είναι ο <strong>Δήμαρχος</strong>, το{" "}
                <strong>Δημοτικό Συμβούλιο και η Δημοτική Επιτροπή</strong>. Ο Δήμαρχος είναι το εκτελεστικό
                όργανο: εκπροσωπεί τον δήμο και υλοποιεί τις αποφάσεις. Οι ίδιες οι αποφάσεις λαμβάνονται στο
                Δημοτικό Συμβούλιο και στη Δημοτική Επιτροπή.
            </p>
            <MunicipalityGovernance />
            <p>
                Κάθε 5 χρόνια διεξάγονται στην Ελλάδα οι αυτοδιοικητικές εκλογές, όπου ψηφίζουμε για την ανάδειξη
                του δημάρχου και των μελών του Δημοτικού Συμβουλίου. Τις τελευταίες δύο δεκαετίες η συμμετοχή στις
                εκλογές πέφτει σχεδόν σε κάθε εκλογική αναμέτρηση. Το 2023, στους μισούς περίπου μεγάλους δήμους
                (το 1/3 των δήμων με τους περισσότερους εγγεγραμμένους), η συμμετοχή ήταν μικρότερη από το 50%. Το
                τι οδηγεί σε αυτό το υψηλό ποσοστό αποχής είναι ένα μεγάλο ερώτημα το οποίο μπορούμε να
                ξεκινήσουμε να το απαντάμε αναλύοντας τι κάνει ένας Δήμος και γιατί είναι τόσο σημαντική η
                συμμετοχή των πολιτών.
            </p>
            <p>
                Τον Νοέμβριο του 2028 θα γίνουν οι Δημοτικές εκλογές στην Ελλάδα. Αυτό σημαίνει ότι καλούμαστε να
                ψηφίσουμε για τον Δήμο στον οποίο ανήκουμε, ποιος θέλει να μας εκπροσωπεί στα θέματα που μας
                απασχολούν καθημερινά στη γειτονιά μας και στο Δήμο μας.
            </p>
            <p>
                Με το νέο κώδικα τοπικής αυτοδιοίκησης που βγήκε σε ΦΕΚ τον Ιούνιο του 2026 ξεκαθαρίστηκαν οι
                αρμοδιότητες του Δημοτικού Συμβουλίου και της Δημοτικής Επιτροπής που μέχρι πρότινος δεν ήταν
                χωρισμένες.
            </p>
        </>
    );
}

function DimotikoSymvoulioBody() {
    return (
        <>
            <p>
                <strong>Το Δημοτικό Συμβούλιο είναι το κύριο αποφασιστικό όργανο</strong> και{" "}
                <strong>εγκρίνει όλα τα σημαντικά θέματα</strong>
            </p>
            <ul>
                <li>Αποφασίζει για τις κατευθύνσεις του δήμου: τον προϋπολογισμό, το τεχνικό πρόγραμμα</li>
                <li>Θέτει τους κανόνες για την λειτουργία του δήμου και των υπηρεσιών του</li>
                <li>Μπορεί να «πάρει πίσω» αρμοδιότητες της Επιτροπής για ιδιαίτερα σοβαρά θέματα</li>
            </ul>
            <p>
                Το Δημοτικό Συμβούλιο αποτελείται από τον <strong>Πρόεδρο</strong>, τον{" "}
                <strong>αντιπρόεδρο</strong>, τον <strong>γραμματέα</strong> και τους <strong>δημοτικούς συμβούλους</strong>.
            </p>
            <p>
                Οι συνεδριάσεις των <strong>Δημοτικών Συμβουλίων</strong> διέπονται από τον εκάστοτε κανονισμό
                Δημοτικού Συμβουλίου. Είναι σε ισχύ ο Πρότυπος Κανονισμός Δημοτικών Συμβουλίων (δείτε{" "}
                <Ext href="https://www.taxheaven.gr/circulars/49448/2804-20-01-2025">
                    το κείμενο του πρότυπου κανονισμού στο tax heaven
                </Ext>
                , ή{" "}
                <Ext href="https://mitos.gov.gr/index.php/%CE%94%CE%94:%CE%A0%CF%81%CF%8C%CF%84%CF%85%CF%80%CE%BF%CF%82_%CE%9A%CE%B1%CE%BD%CE%BF%CE%BD%CE%B9%CF%83%CE%BC%CF%8C%CF%82_%CE%9B%CE%B5%CE%B9%CF%84%CE%BF%CF%85%CF%81%CE%B3%CE%AF%CE%B1%CF%82_%CE%94%CE%B7%CE%BC%CE%BF%CF%84%CE%B9%CE%BA%CE%BF%CF%8D_%CE%A3%CF%85%CE%BC%CE%B2%CE%BF%CF%85%CE%BB%CE%AF%CE%BF%CF%85">
                    τη διαδικασία στο mitos
                </Ext>
                ), στον οποίο το κάθε Δημοτικό Συμβούλιο μπορεί να κάνει κάποιες αλλαγές και έπειτα να ψηφίσει.
            </p>
            <p>
                Στην αρχή της δημοτικής περιόδου, το Δημοτικό Συμβούλιο εκλέγει το προεδρείο του Δημοτικού
                Συμβουλίου, επικεφαλής του οποίου είναι ο/η Πρόεδρος. Με ευθύνη του Προέδρου και του προεδρείου
                συγκαλείται το Δημοτικό Συμβούλιο, φτιάχνονται οι ημερήσιες διατάξεις, διαπιστώνεται η απαρτία,
                διευθύνεται η συζήτηση και τηρούνται τα πρακτικά.
            </p>
            <AgendaViewer
                title="Ημερήσια Διάταξη Δ.Σ. Δήμου Αθηναίων, 24η Συνεδρίαση"
                badge="PDF"
                pdf="https://townhalls-gr.fra1.digitaloceanspaces.com/uploads/athens_jun24_2026_agenda_2.pdf"
                mobileImage="https://data.opencouncil.gr/explain/agenda_athens_jun24_2026_p1.jpg"
                meeting={{
                    href: "/athens/jun24_2026_2",
                    city: "Δήμος Αθηναίων",
                    title: "Δημοτικό Συμβούλιο",
                    date: "24 Ιουνίου 2026",
                    logo: "https://townhalls-gr.fra1.digitaloceanspaces.com/city-logos/111df3eb-6f14-42a4-8c4d-1657eb1ffe96.png",
                }}
            />
            <p>Υπάρχουν τα ακόλουθα είδη συνεδριάσεων:</p>
            <ul>
                <li>
                    <strong>Τακτικές συνεδριάσεις</strong>: Διεξάγονται τουλάχιστον μια φορά το μήνα. Ο/Η Πρόεδρος
                    του Δημοτικού Συμβουλίου δημοσιεύει μια πρόσκληση τρεις τουλάχιστον μέρες νωρίτερα, η οποία
                    περιλαμβάνει την ημερήσια διάταξη — τα θέματα δηλαδή προς συζήτηση. Μπορείτε{" "}
                    <Ext href="https://opencouncil.gr/athens/jun24_2026_2">
                        να δείτε τη τελευταία τακτική συνεδρίαση του Δήμου Αθηναίων στο opencouncil.gr
                    </Ext>
                    .
                </li>
                <li>
                    <strong>Κατεπείγουσες συνεδριάσεις</strong>: Όταν υπάρχει τεκμηριωμένη ανάγκη, ο/η Πρόεδρος του
                    Δημοτικού Συμβουλίου μπορεί να συγκαλέσει έκτακτο Δημοτικό Συμβούλιο ακόμα και την ίδια μέρα.
                    Σε αυτή την περίπτωση, το Δημοτικό Συμβούλιο ψηφίζει στην αρχή της συνεδρίασης για το ποια
                    θέματα κρίνονται κατεπείγοντα.
                </li>
                <li>
                    <strong>Δια περιφοράς συνεδριάσεις</strong>: Για εξαιρετικά επείγοντα θέματα, ο/η πρόεδρος
                    μπορεί να ζητήσει από τους δημοτικούς συμβούλους να ψηφίσουν και να εκθέσουν τις απόψεις τους
                    ηλεκτρονικά ή μέσω τηλεφώνου. Οι αποφάσεις της δια περιφοράς συνεδρίασης αναφέρονται στο
                    επόμενο τακτικό Δημοτικό Συμβούλιο.
                </li>
                <li>
                    <strong>Ειδικές συνεδριάσεις λογοδοσίας</strong>: Μια συνεδρίαση στην οποία δε λαμβάνονται
                    αποφάσεις, αλλά όπου «η Δημοτική Αρχή λογοδοτεί για το έργο και τη δράση της, όπως για πράξεις,
                    παραλείψεις, υλικές ενέργειες ή τον προγραμματισμό και την εξέλιξη δράσεων». Στη συνεδρίαση
                    συζητούνται έως δέκα (10) θέματα τα οποία τίθενται από τους Δημοτικούς Συμβούλους, και εώς δύο
                    θέματα από τους προέδρους Δημοτικών Κοινοτήτων. Σε όλα τα θέματα οφείλει να απαντήσει
                    εκπρόσωπος της Δημοτικής Αρχής (συνήθως ο δήμαρχος ή ο αρμόδιος αντιδήμαρχος).
                </li>
            </ul>
            <p>
                <strong>Κορμός</strong> της συνεδρίασης του Δημοτικού Συμβουλίου είναι η{" "}
                <strong>ημερήσια διάταξη</strong>, που είναι μια αριθμημένη λίστα των θεμάτων προς συζήτηση και
                ψήφιση. Κάθε θέμα της διάταξης έχει έναν εισηγητή, και μπορεί να συνοδεύεται και από μια εισήγηση,
                που αν και αποτελεί δημόσιο έγγραφο, συχνά δεν είναι εύκολα προσβάσιμο στους πολίτες.
            </p>
        </>
    );
}

function LeitourgiaSymvouliouBody() {
    return (
        <p>
            Συνεδριάζει τακτικά τουλάχιστον μια φορά το μήνα από πρόσκληση του προέδρου προς τα μέλη του Δημοτικού
            Συμβουλίου. Η πρόσκληση είναι γραπτή και φτάνει στους συμβούλους 3 ημέρες νωρίτερα και αναρτάται την
            ίδια μέρα στην ιστοσελίδα του δήμου. Για να ξεκινήσει νόμιμα η συνεδρίαση χρειάζεται απαρτία, οι μισοί
            δημοτικοί σύμβουλοι +1, και οι αποφάσεις λαμβάνονται με φανερή ψηφοφορία.
        </p>
    );
}

function DimotikiEpitropiBody() {
    return (
        <>
            <p>Η Δημοτική Επιτροπή είναι το διοικητικό εργαλείο του δήμου και ασχολείται με καθημερινά ζητήματα.</p>
            <ul>
                <li>Προκυρήσσει και κατοχυρώνει διαγωνισμούς, αναθέτει έργα και υπηρεσίες</li>
                <li>Αποφασίζει για προσλήψεις και για δικηγόρους</li>
                <li>
                    Ασχολείται με καθημερινά ζητήματα που αφορούν τη γειτονιά μας: άδειες καταστημάτων, παράταση
                    ωραρίου μουσικής, θέσεις στάθμευσης, αναπλάσεις
                </li>
                <li>Υποβάλλει αιτήματα για εθνικά ή ευρωπαϊκά προγράμματα και κονδύλια</li>
            </ul>
            <blockquote>
                <em>
                    Το Δημοτικό Συμβούλιο αποφασίζει “που” πάει ο δήμος &amp; η Δημοτική Επιτροπή “πως” θα πάει
                    εκεί.
                </em>
            </blockquote>
            <TikTokEmbed
                videoId="7660528291048148246"
                cite="https://www.tiktok.com/@opencouncil/video/7660528291048148246"
            >
                <a
                    target="_blank"
                    rel="noopener noreferrer"
                    title="@opencouncil"
                    href="https://www.tiktok.com/@opencouncil?refer=embed"
                >
                    @opencouncil
                </a>{" "}
                Replying to @Katrina A τι άλλο θέλετε να συζητήσουμε;☺️{" "}
                <a
                    title="opencouncil"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://www.tiktok.com/tag/opencouncil?refer=embed"
                >
                    #Opencouncil
                </a>{" "}
                <a
                    title="τοπικήαυτοδιοίκηση"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://www.tiktok.com/tag/%CF%84%CE%BF%CF%80%CE%B9%CE%BA%CE%AE%CE%B1%CF%85%CF%84%CE%BF%CE%B4%CE%B9%CE%BF%CE%AF%CE%BA%CE%B7%CF%83%CE%B7?refer=embed"
                >
                    #τοπικήαυτοδιοίκηση
                </a>{" "}
                <a
                    title="localgov"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://www.tiktok.com/tag/localgov?refer=embed"
                >
                    #localgov
                </a>{" "}
                <a
                    title="municipalities"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://www.tiktok.com/tag/municipalities?refer=embed"
                >
                    #municipalities
                </a>{" "}
                <a
                    target="_blank"
                    rel="noopener noreferrer"
                    title="♬ original sound OpenCouncil"
                    href="https://www.tiktok.com/music/original-sound-OpenCouncil-0?refer=embed"
                >
                    ♬ original sound OpenCouncil
                </a>
            </TikTokEmbed>
        </>
    );
}

function DimotikesKoinotitesBody() {
    return (
        <>
            <p>
                Κάποιοι δήμοι έχουν <strong>Δημοτικές Κοινότητες</strong>. Σε αυτή τη περίπτωση, κάθε κοινότητα
                έχει προέδρους κοινοτήτων ή και κοινοτικά συμβούλια. Για παράδειγμα η Αθήνα, που είναι ο
                μεγαλύτερος δήμος της Ελλάδας, έχει 7 Δημοτικές Κοινότητες.
            </p>
            <Figure
                src="https://data.opencouncil.gr/explain/7_communities.jpg"
                alt="Οι 7 Δημοτικές Κοινότητες του Δήμου Αθηναίων"
                caption="Οι 7 Δημοτικές Κοινότητες του Δήμου Αθηναίων"
            />
            <p>
                Σύμφωνα με το ισχύον θεσμικό πλαίσιο, οι Δημοτικές Κοινότητες αποτελούν μονάδες εσωτερικής
                αποκέντρωσης των δήμων. Δεν έχουν νομική προσωπικότητα ούτε διοικητική αυτοτέλεια. Λειτουργούν
                εντός του ενιαίου νομικού προσώπου του δήμου και τα όργανά τους δεν υποκαθιστούν τα κεντρικά όργανα
                διοίκησης (Δήμαρχο, Δημοτικό Συμβούλιο, Δημοτική Επιτροπή).
            </p>
            <p>
                Ωστόσο, διαθέτουν δικά τους αιρετά όργανα, τα οποία εκλέγονται άμεσα από τους πολίτες της οικείας
                κοινότητας κατά τις δημοτικές εκλογές. Η θητεία τους είναι πενταετής, παράλληλη με εκείνη της
                δημοτικής αρχής και η αποστολή τους είναι σαφής:
            </p>
            <ul>
                <li>Να εκφράζουν θεσμικά τις ανάγκες της τοπικής κοινωνίας.</li>
                <li>
                    Να εισηγούνται και, σε ορισμένες περιπτώσεις, να αποφασίζουν για ζητήματα που αφορούν
                    αποκλειστικά τη γεωγραφική τους ενότητα.
                </li>
                <li>Να λειτουργούν ως δίαυλος επικοινωνίας μεταξύ κατοίκων και δημοτικής αρχής.</li>
            </ul>
            <p>
                Είτε αποφασίζει το Δημοτικό Συμβούλιο, είτε η Δημοτική Επιτροπή οι αποφάσεις καταλήγουν στην
                Διαύγεια.
            </p>
        </>
    );
}

function DiavgeiaBody() {
    return (
        <p>
            Όλες οι αποφάσεις του Δήμου αναρτώνται υποχρεωτικά στην Διαύγεια, η οποία είναι η επίσημη ιστοσελίδα της κυβέρνησης (<Ext href="https://diavgeia.gov.gr/">diavgeia.gov.gr</Ext>). Με λίγα λόγια, ότι αποφασίζεται και ψηφίζεται κατά τη διάρκεια του Δημοτικού
            Συμβουλίου αναρτάται εκεί. Κάθε απόφαση παίρνει έναν μοναδικό κωδικό ΑΔΑ (Αριθμός διαδικτυακής ανάρτησης) με τον οποίο μπορεί κανείς να εντοπίσει εύκολα ένα έγγραφο ή μια απόφαση.
        </p>
    );
}

function YpochreotikiMetadosiBody() {
    return (
        <>
            <p>
                Πριν τεθεί σε ισχύ ο νέος κώδικας της τοπικής αυτοδιοίκησης, το αν θα μεταδίδεται μια συνεδρίαση
                Δημοτικού Συμβουλίου ή Δημοτικής Επιτροπής ήταν επιλογή του κάθε δήμου. Πολλοί δήμοι, αλλά όχι
                όλοι, μετέδιδαν τις συνεδριάσεις των Δημοτικών Συμβουλίων τους στο YouTube ή στο Facebook. Οι
                Δημοτικές Επιτροπές, από την άλλη, δεν μεταδίδονταν σχεδόν ποτέ, και ελάχιστοι δήμοι δημοσίευαν
                έστω τα πρακτικά τους.
            </p>
            <p>
                Με τον νέο κώδικα, η{" "}
                <strong>
                    ζωντανή μετάδοση των συνεδριάσεων μέσω διαδικτύου ή κοινωνικών δικτύων γίνεται υποχρεωτική και
                    για το Δημοτικό Συμβούλιο
                </strong>{" "}
                (άρθρο 122 §2) <strong>και για τις Δημοτικές Επιτροπές</strong> (άρθρο 140 §2). Ιδιαίτερα για τις
                Δημοτικές Επιτροπές, <strong>αυτό που ήταν εξαίρεση, τώρα γίνεται κανόνας για όλους</strong>. Και
                στα δύο όργανα, η διεξαγωγή συνεδρίασης κεκλεισμένων των θυρών επιτρέπεται μόνο με πλειοψηφία 3/5.
            </p>
        </>
    );
}

function OpenCouncilBody() {
    return (
        <>
            <p>
                Κάθε συνεδρίαση Δημοτικού Συμβουλίου και Δημοτικής Επιτροπής είναι ανοιχτή σε όλους και μπορεί να
                την παρακολουθήσει μέσω των επίσημων καναλιών του κάθε δήμου.
            </p>
            <div className="not-prose my-6 flex items-start gap-3 rounded-2xl border border-orange/30 bg-orange/5 p-5">
                <span className="text-2xl leading-none" aria-hidden="true">
                    ✨
                </span>
                <p className="text-base font-semibold leading-relaxed text-foreground">
                    Το OpenCouncil μετατρέπει τις πολύωρες συνεδριάσεις σε κατανοητό, αναζητήσιμο και προσβάσιμο
                    περιεχόμενο - αυτόματα.
                </p>
            </div>
            <p>
                Μεταξύ άλλων, το OpenCouncil απομαγνητοφωνεί τις συνεδριάσεις των Δημοτικών Συμβουλίων, αναγνωρίζει
                ομιλητές, εξάγει συνόψεις από κάθε τοποθέτηση που γίνεται στη συνεδρίαση, παράγει στατιστικά,
                φτιάχνει σελίδες{" "}
                <Ext href="https://opencouncil.gr/athens/parties/cm0tq4fgs08m54o47ljf1jxxd">παρατάξεων</Ext> και{" "}
                <Ext href="https://opencouncil.gr/athens/people/cm0tqeh9m08mj4o47a2xw2265">ομιλητών</Ext>, κάνει
                όλες τις συνεδριάσεις αναζητήσιμες
            </p>
        </>
    );
}

export const ARTICLES: ExplainArticle[] = [
    { id: "ellinikoi-dimoi", title: "Οι Δήμοι στην Ελλάδα", Body: EllinikoiDimoiBody },
    { id: "esoda-dimon", title: "Πως βγάζει χρήματα ένας Δήμος;", Body: EsodaDimonBody },
    { id: "dioikisi-dimou", title: "Πως διοικείται ένας Δήμος;", Body: DioikisiDimouBody },
    { id: "dimotiko-symvoulio", title: "Τι κάνει το Δημοτικό Συμβούλιο;", Body: DimotikoSymvoulioBody },
    { id: "leitourgia-symvouliou", title: "Πότε και πως συνεδριάζει το Δημοτικό Συμβούλιο;", Body: LeitourgiaSymvouliouBody },
    { id: "dimotiki-epitropi", title: "Τι κάνει η Δημοτική Επιτροπή;", Body: DimotikiEpitropiBody },
    {
        id: "dimotikes-koinotites",
        title: "Τι είναι οι Δημοτικές Κοινότητες;",
        Body: DimotikesKoinotitesBody,
    },
    { id: "diavgeia", title: "Που αναρτούνται οι αποφάσεις;", Body: DiavgeiaBody },
    {
        id: "ypochreotiki-metadosi",
        title: "Είναι υποχρεωτική η μετάδοση των συνεδριάσεων;",
        Body: YpochreotikiMetadosiBody,
    },
    { id: "opencouncil", title: "Πως δουλεύει το OpenCouncil;", Body: OpenCouncilBody },
];

/** Lightweight section list (id + title) for the ToC and mobile navigator. */
export const SECTIONS = ARTICLES.map(({ id, title }) => ({ id, title }));
