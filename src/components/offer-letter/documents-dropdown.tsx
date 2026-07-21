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
import { deriveOfferCpv } from "@/lib/offers/display";
import { DocumentParamsDialog } from "./document-params-dialog";
import type { ProcurementDocParams } from "./docx/shared";

type ParamsDocKind = "financial" | "technical-offer";

const PARAMS_DOC_TITLES: Record<ParamsDocKind, string> = {
    financial: "Οικονομική Προσφορά",
    "technical-offer": "Τεχνική Προσφορά",
};

/**
 * Header dropdown offering the offer's .docx documents. Generators are
 * lazy-loaded on selection so the docx library stays out of the page bundle.
 * Procurement documents first ask for project parameters via a dialog; the
 * entered values persist so the next document opens prefilled.
 */
export function DocumentsDropdown({ offer }: { offer: Offer }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [paramsDoc, setParamsDoc] = useState<ParamsDocKind | null>(null);
    const [savedParams, setSavedParams] = useState<ProcurementDocParams | null>(null);

    const initialParams: ProcurementDocParams = savedParams ?? {
        projectName: "",
        studyNumber: "",
        protocolNumber: "",
        cpv: deriveOfferCpv(offer),
    };

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

    async function generateParamsDoc(kind: ParamsDocKind, params: ProcurementDocParams) {
        setSavedParams(params);
        try {
            if (kind === "financial") {
                const { downloadFinancialOffer } = await import("./docx/FinancialOfferDocx");
                await downloadFinancialOffer(offer, params);
            } else {
                const { downloadTechnicalOffer } = await import("./docx/TechnicalOfferDocx");
                await downloadTechnicalOffer(offer, params);
            }
        } catch (err) {
            console.error("Failed to generate document:", err);
            alert("Δεν ήταν δυνατή η δημιουργία του εγγράφου. Δοκιμάστε ξανά.");
        }
    }

    return (
        <>
            {/* modal={false}: opening the params Dialog from a modal dropdown
                leaves body pointer-events:none behind (Radix restore race). */}
            <DropdownMenu modal={false}>
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
                    <DropdownMenuItem
                        disabled={busy !== null}
                        onSelect={() => setParamsDoc("financial")}
                    >
                        <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                        Οικονομική Προσφορά
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={busy !== null}
                        onSelect={() => setParamsDoc("technical-offer")}
                    >
                        <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                        Τεχνική Προσφορά
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DocumentParamsDialog
                open={paramsDoc !== null}
                onOpenChange={(open) => {
                    if (!open) setParamsDoc(null);
                }}
                title={paramsDoc ? PARAMS_DOC_TITLES[paramsDoc] : ""}
                initial={initialParams}
                onSubmit={async (params) => {
                    if (paramsDoc) await generateParamsDoc(paramsDoc, params);
                }}
            />
        </>
    );
}
