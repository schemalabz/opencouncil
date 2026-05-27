"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Check, AlertCircle, FileVideo, X, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS, ACCEPTED_TYPES, MAX_SIZE_BYTES } from "./dummy-data";

export type UploadStatus = "idle" | "validating" | "uploading" | "success" | "error";

export type UploadErrorKind = "wrong-type" | "too-big" | "network" | null;

export interface MockDragDropProps {
    onFileSelected?: (file: File) => void;
    onComplete?: (file: File) => void;
    /** Simulate a network failure mid-upload (for demo). */
    simulateNetworkFail?: boolean;
    /** Reset trigger - increment to clear state from parent. */
    resetKey?: number;
    /** Show a compact variant (e.g. when meeting is pre-selected). */
    compact?: boolean;
}

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function MockDragDrop({
    onFileSelected,
    onComplete,
    simulateNetworkFail = false,
    resetKey = 0,
    compact = false,
}: MockDragDropProps) {
    const [isDragging, setIsDragging] = React.useState(false);
    const [status, setStatus] = React.useState<UploadStatus>("idle");
    const [errorKind, setErrorKind] = React.useState<UploadErrorKind>(null);
    const [errorMsg, setErrorMsg] = React.useState<string>("");
    const [file, setFile] = React.useState<File | null>(null);
    const [progress, setProgress] = React.useState(0);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    React.useEffect(() => {
        // External reset
        setStatus("idle");
        setErrorKind(null);
        setErrorMsg("");
        setFile(null);
        setProgress(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, [resetKey]);

    React.useEffect(() => () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, []);

    const validate = (f: File): { ok: boolean; kind?: UploadErrorKind; msg?: string } => {
        const ext = f.name.toLowerCase().slice(f.name.lastIndexOf("."));
        const typeOk = ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXTENSIONS.includes(ext);
        if (!typeOk) {
            return { ok: false, kind: "wrong-type", msg: `Δεν δεχόμαστε αρχεία τύπου ${ext || f.type || "άγνωστο"}. Επιτρέπονται: ${ACCEPTED_EXTENSIONS.join(", ")}` };
        }
        if (f.size > MAX_SIZE_BYTES) {
            return { ok: false, kind: "too-big", msg: `Το αρχείο είναι ${formatBytes(f.size)}. Μέγιστο επιτρεπτό: ${formatBytes(MAX_SIZE_BYTES)}.` };
        }
        return { ok: true };
    };

    const startFakeUpload = (f: File) => {
        setProgress(0);
        setStatus("uploading");
        let p = 0;
        intervalRef.current = setInterval(() => {
            p += Math.random() * 8 + 2;
            // If simulating network fail, throw error around 45%
            if (simulateNetworkFail && p >= 45) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                setErrorKind("network");
                setErrorMsg("Διακοπή σύνδεσης. Παρακαλώ δοκιμάστε ξανά.");
                setStatus("error");
                setProgress(0);
                return;
            }
            if (p >= 100) {
                p = 100;
                setProgress(100);
                if (intervalRef.current) clearInterval(intervalRef.current);
                setTimeout(() => {
                    setStatus("success");
                    onComplete?.(f);
                }, 250);
                return;
            }
            setProgress(Math.floor(p));
        }, 180);
    };

    const handleFile = (f: File) => {
        setFile(f);
        setStatus("validating");
        const v = validate(f);
        if (!v.ok) {
            setErrorKind(v.kind!);
            setErrorMsg(v.msg!);
            setStatus("error");
            return;
        }
        setErrorKind(null);
        setErrorMsg("");
        onFileSelected?.(f);
        startFakeUpload(f);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    };

    const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = "";
    };

    const reset = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus("idle");
        setErrorKind(null);
        setErrorMsg("");
        setFile(null);
        setProgress(0);
    };

    const retry = () => {
        if (!file) return;
        // Re-run validation + upload; ignore simulateNetworkFail on retry so it can succeed
        setErrorKind(null);
        setErrorMsg("");
        startFakeUpload(file);
    };

    return (
        <div className="w-full">
            <div
                className={cn(
                    "relative rounded-xl border-2 border-dashed transition-all",
                    compact ? "p-6" : "p-10",
                    isDragging ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-muted-foreground/30 bg-muted/30",
                    status === "error" && "border-destructive/50 bg-destructive/5",
                    status === "success" && "border-green-500/50 bg-green-50/40",
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
            >
                {status === "idle" && (
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="rounded-full bg-primary/10 p-4">
                            <Upload className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                            <p className="text-base font-medium">Σύρετε το αρχείο της συνεδρίασης εδώ</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                ή{" "}
                                <button type="button" className="text-primary underline underline-offset-2 hover:opacity-80" onClick={() => fileInputRef.current?.click()}>
                                    επιλέξτε από τον υπολογιστή
                                </button>
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                MP4, MOV, MKV, MP3, WAV, M4A · έως 5GB
                            </p>
                        </div>
                    </div>
                )}

                {(status === "validating" || status === "uploading") && file && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <FileVideo className="h-6 w-6 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                            </div>
                            {status === "validating" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <span className="text-sm font-medium tabular-nums">{progress}%</span>
                            )}
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                            {status === "validating" ? "Έλεγχος αρχείου…" : "Ανέβασμα… μην κλείσετε το παράθυρο."}
                        </p>
                    </div>
                )}

                {status === "success" && file && (
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="rounded-full bg-green-100 p-4">
                            <Check className="h-7 w-7 text-green-700" />
                        </div>
                        <div>
                            <p className="text-base font-medium text-green-900">Το αρχείο ανέβηκε επιτυχώς</p>
                            <p className="text-sm text-muted-foreground mt-1 truncate max-w-[28ch] sm:max-w-md">
                                {file.name} · {formatBytes(file.size)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Η ομάδα του OpenCouncil θα ξεκινήσει την επεξεργασία σύντομα.
                            </p>
                        </div>
                        <button type="button" onClick={reset} className="text-sm text-primary underline underline-offset-2 mt-2">
                            Ανέβασμα άλλου αρχείου
                        </button>
                    </div>
                )}

                {status === "error" && (
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="rounded-full bg-destructive/10 p-4">
                            <AlertCircle className="h-7 w-7 text-destructive" />
                        </div>
                        <div>
                            <p className="text-base font-medium text-destructive">
                                {errorKind === "wrong-type" && "Μη υποστηριζόμενος τύπος αρχείου"}
                                {errorKind === "too-big" && "Το αρχείο είναι πολύ μεγάλο"}
                                {errorKind === "network" && "Αποτυχία ανεβάσματος"}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-md">{errorMsg}</p>
                        </div>
                        <div className="flex gap-2 mt-1">
                            {errorKind === "network" && (
                                <button type="button" onClick={retry} className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90">
                                    Δοκιμή ξανά
                                </button>
                            )}
                            <button type="button" onClick={reset} className="text-sm px-3 py-1.5 rounded-md border border-input hover:bg-muted">
                                <X className="h-3.5 w-3.5 inline mr-1" />
                                Επιλογή άλλου αρχείου
                            </button>
                        </div>
                    </div>
                )}

                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    onChange={handlePick}
                />

                <AnimatePresence>
                    {isDragging && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm pointer-events-none"
                        >
                            <p className="text-base font-semibold text-primary">Αφήστε το αρχείο εδώ</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
