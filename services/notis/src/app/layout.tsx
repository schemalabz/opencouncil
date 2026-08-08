import type { Metadata } from "next";
import { inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ο Νότης — προσωπική ενημέρωση από τον δήμο σου",
  description:
    "Ο Νότης παρακολουθεί τα δημοτικά συμβούλια στο OpenCouncil και σου γράφει στο WhatsApp μόνο όταν κάτι σε αφορά πραγματικά.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
