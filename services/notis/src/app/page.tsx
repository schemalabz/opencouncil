import { Card, CardContent } from "@opencouncil/ui/card";
import { Button } from "@opencouncil/ui/button";

function WhatsAppBubble({ children, from }: { children: React.ReactNode; from: "notis" | "user" }) {
  return (
    <div className={`flex ${from === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          from === "notis"
            ? "rounded-tl-sm bg-white text-foreground"
            : "rounded-tr-sm bg-[#d9fdd3] text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Πες του ποιος είσαι",
    body: "Διάλεξε δήμο, θέματα και γειτονιές που σε ενδιαφέρουν στο opencouncil.gr. Ο Νότης διαβάζει τις προτιμήσεις σου και σε γνωρίζει καλύτερα όσο του μιλάς.",
  },
  {
    title: "Εκείνος διαβάζει τα πάντα",
    body: "Κάθε συνεδρίαση δημοτικού συμβουλίου που δημοσιεύεται στο OpenCouncil: αποφάσεις, ψηφοφορίες, ποσά, απομαγνητοφωνήσεις.",
  },
  {
    title: "Σου γράφει μόνο όταν αξίζει",
    body: "Η σιωπή είναι χαρακτηριστικό, όχι ελάττωμα. Τις περισσότερες εβδομάδες δεν θα σου γράψει τίποτα — κι όταν γράφει, θα θες να το διαβάσεις.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-16">
      <section className="space-y-4 text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">OpenCouncil</p>
        <h1 className="font-relative text-4xl sm:text-5xl">Γεια σας, είμαι ο Νότης.</h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Παρακολουθώ το δημοτικό συμβούλιο του δήμου σου και σου γράφω στο WhatsApp
          μόνο όταν κάτι αγγίζει τη ζωή σου. Σαν τον γείτονα που κάθεται σε κάθε
          συνεδρίαση και σου λέει το ένα πράγμα που αξίζει να ξέρεις.
        </p>
      </section>

      <section className="rounded-3xl bg-[#efeae2] p-6 sm:p-10">
        <div className="space-y-3">
          <WhatsAppBubble from="notis">
            Η πλατεία στην Κυψέλη παίρνει 2,3 εκατ. για ανάπλαση. Πέρασε ομόφωνα χθες,
            και τα έργα ξεκινούν τον Σεπτέμβρη. Δες τη συζήτηση: opencouncil.gr
          </WhatsAppBubble>
          <WhatsAppBubble from="user">Ποιος θα κάνει το έργο;</WhatsAppBubble>
          <WhatsAppBubble from="notis">
            Ο ανάδοχος δεν έχει οριστεί ακόμα — χθες εγκρίθηκε η μελέτη και η
            χρηματοδότηση. Ο διαγωνισμός αναμένεται μέσα στο καλοκαίρι. Θα σου πω
            όταν υπάρξει απόφαση.
          </WhatsAppBubble>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Πραγματικό παράδειγμα του τρόπου που γράφει ο Νότης.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Card key={step.title} className="border-border">
            <CardContent className="space-y-2 p-6">
              <div className="text-sm font-medium text-orange">{i + 1}</div>
              <h2 className="font-medium">{step.title}</h2>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4 text-center">
        <h2 className="font-relative text-2xl">Πάνω στο OpenCouncil</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Το OpenCouncil απομαγνητοφωνεί και δημοσιεύει τα δημοτικά συμβούλια, για να
          ξέρει κάθε δημότης τι αποφασίζεται στο όνομά του. Ο Νότης είναι ο πιο
          προσωπικός τρόπος να το παρακολουθείς.
        </p>
        <Button asChild variant="outline">
          <a href="https://opencouncil.gr">Δες το OpenCouncil</a>
        </Button>
        <p className="text-sm text-muted-foreground">Έρχεται σύντομα σε WhatsApp κοντά σου.</p>
      </section>

      <footer className="border-t pt-8 text-center text-xs text-muted-foreground">
        <p>
          Απαντάς ΣΤΟΠ ανά πάσα στιγμή και ο Νότης σταματά να σου γράφει. Χωρίς
          ψιλά γράμματα.
        </p>
        <p className="mt-2">
          <a className="underline" href="https://opencouncil.gr/explain">
            Πώς λειτουργεί η τοπική αυτοδιοίκηση
          </a>{" "}
          · <a className="underline" href="https://opencouncil.gr">opencouncil.gr</a>
        </p>
      </footer>
    </main>
  );
}
