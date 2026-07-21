"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import type { Offer } from "@prisma/client";

/**
 * Header dropdown offering the offer's .docx documents. Generators are
 * lazy-loaded on selection so the docx library stays out of the page bundle.
 */
export function DocumentsDropdown({ offer }: { offer: Offer }) {
    const [busy, setBusy] = useState<string | null>(null);

    async function downloadTechnicalDescription() {
        setBusy("technical-description");
        try {
            const { downloadTechnicalDescription } = await import(
                "./docx/TechnicalDescriptionDocx"
            );
            await downloadTechnicalDescription(offer);
        } catch (err) {
            console.error("Failed to generate document:", err);
            alert("Δεν ήταν δυνατή η δημιουργία του εγγράφου. Δοκιμάστε ξανά.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">
                    {busy ? (
                        <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                    ) : (
                        <FileText className="w-4 h-4 sm:mr-2" />
                    )}
                    <span className="hidden sm:inline">Έγγραφα</span>
                    <ChevronDown className="w-4 h-4 ml-1 sm:ml-2" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Έγγραφα προσφοράς (.docx)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={busy !== null}
                    onSelect={(e) => {
                        e.preventDefault();
                        downloadTechnicalDescription();
                    }}
                >
                    <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                    Πρότυπο τεχνικής περιγραφής
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
