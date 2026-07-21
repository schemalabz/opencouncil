"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { ProcurementDocParams } from "./docx/shared";

/**
 * Parameters needed by the procurement documents (Οικονομική / Τεχνική
 * Προσφορά). Values persist in the parent between openings so the second
 * document is prefilled with what was entered for the first.
 */
export function DocumentParamsDialog({
    open,
    onOpenChange,
    title,
    initial,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initial: ProcurementDocParams;
    onSubmit: (params: ProcurementDocParams) => Promise<void>;
}) {
    const [params, setParams] = useState<ProcurementDocParams>(initial);
    const [busy, setBusy] = useState(false);

    // Re-seed the fields each time the dialog opens (e.g. with the params
    // saved from a previous document).
    useEffect(() => {
        if (open) setParams(initial);
    }, [open, initial]);

    const valid =
        params.projectName.trim() &&
        params.studyNumber.trim() &&
        params.protocolNumber.trim() &&
        params.cpv.trim();

    async function handleSubmit() {
        if (!valid) return;
        setBusy(true);
        try {
            await onSubmit({
                projectName: params.projectName.trim(),
                studyNumber: params.studyNumber.trim(),
                protocolNumber: params.protocolNumber.trim(),
                cpv: params.cpv.trim(),
            });
            onOpenChange(false);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Τα στοιχεία του έργου συμπληρώνονται στο έγγραφο και
                        παραμένουν προσυμπληρωμένα για τα υπόλοιπα έγγραφα της
                        προσφοράς.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="doc-project-name">Όνομα έργου</Label>
                        <Textarea
                            id="doc-project-name"
                            rows={3}
                            placeholder="π.χ. ΜΑΓΝΗΤΟΣΚΟΠΗΣΗ, ΑΠΟΜΑΓΝΗΤΟΦΩΝΗΣΗ ΚΑΙ ΚΑΤΑΧΩΡΗΣΗ ΣΤΟΙΧΕΙΩΝ ΣΥΝΕΔΡΙΑΣΕΩΝ ΣΥΛΛΟΓΙΚΩΝ ΟΡΓΑΝΩΝ ΔΗΜΟΥ ... ΕΤΟΥΣ 2026 ΣΕ ΔΙΑΔΙΚΤΥΑΚΗ ΠΛΑΤΦΟΡΜΑ"
                            value={params.projectName}
                            onChange={(e) =>
                                setParams((p) => ({ ...p, projectName: e.target.value }))
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-study-number">Αριθμός μελέτης</Label>
                            <Input
                                id="doc-study-number"
                                placeholder="π.χ. 93/2025"
                                value={params.studyNumber}
                                onChange={(e) =>
                                    setParams((p) => ({ ...p, studyNumber: e.target.value }))
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="doc-protocol-number">
                                Αρ. πρωτοκόλλου πρόσκλησης
                            </Label>
                            <Input
                                id="doc-protocol-number"
                                placeholder="π.χ. 22201"
                                value={params.protocolNumber}
                                onChange={(e) =>
                                    setParams((p) => ({ ...p, protocolNumber: e.target.value }))
                                }
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="doc-cpv">CPV</Label>
                        <Input
                            id="doc-cpv"
                            value={params.cpv}
                            onChange={(e) => setParams((p) => ({ ...p, cpv: e.target.value }))}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Ακύρωση
                    </Button>
                    <Button onClick={handleSubmit} disabled={!valid || busy}>
                        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Δημιουργία εγγράφου
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
