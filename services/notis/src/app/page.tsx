import Image from "next/image";

/**
 * Nobody arrives here from a message: every template button points at
 * opencouncil.gr, and the reader who has Νότης already talks to him on
 * WhatsApp. This page is what someone finds when they type the domain, so
 * it says who he is in one line and sends them where they can get him.
 */
export default function LandingPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center text-center">
        {/* Decorative: the heading under it already names him. The file is
            1606x1354, so 85x72 is its own shape at this size — a square box
            squashes the butterfly, and the intrinsic size would have the
            browser fetch a 3840px source for a logo this small. */}
        <Image src="/logo.png" alt="" width={85} height={72} priority />

        <h1 className="mt-7 font-relative text-3xl">Ο Νότης</h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Παρακολουθεί τα δημοτικά συμβούλια και σου γράφει στο WhatsApp μόνο όταν κάτι σε
          αφορά.
        </p>

        <a
          href="https://opencouncil.gr/notifications"
          className="mt-7 text-[hsl(var(--orange-deep))] underline underline-offset-4 hover:no-underline"
        >
          opencouncil.gr/notifications
        </a>
      </div>
    </main>
  );
}
