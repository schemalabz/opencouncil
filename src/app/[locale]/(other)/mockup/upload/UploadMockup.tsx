"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2, Mail, Sparkles, ChevronRight, Info, AlertTriangle, RotateCcw } from "lucide-react";
import { DUMMY_CITIES, DUMMY_MEETINGS, ADMIN_BODIES, DummyCity, DummyMeeting, fakeParseFilename } from "./dummy-data";
import { MockDragDrop } from "./MockDragDrop";

type Variant = "a" | "b" | "c";

function formatGreekDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("el-GR", { day: "2-digit", month: "long", year: "numeric" }) +
        " · " + d.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function VariantSwitcher({ current }: { current: Variant }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const setVariant = (v: Variant) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("variant", v);
        if (v !== "a") {
            params.delete("city");
            params.delete("meeting");
        } else if (!params.get("city")) {
            params.set("city", "athens");
            params.set("meeting", "athens-2026-05-15");
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    const variants: { id: Variant; label: string; sub: string }[] = [
        { id: "a", label: "A · Pre-filled link", sub: "Email-based, μηδέν επιλογές" },
        { id: "b", label: "B · Public wizard", sub: "Επιλέγω δήμο & meeting" },
        { id: "c", label: "C · Filename parse", sub: "Smart guess από όνομα αρχείου" },
    ];

    return (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Design variant (mockup — όχι production)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {variants.map(v => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => setVariant(v.id)}
                        className={`text-left rounded-md border px-3 py-2 transition-colors ${
                            current === v.id ? "border-primary bg-primary/10" : "border-input hover:bg-muted"
                        }`}
                    >
                        <p className="text-sm font-medium">{v.label}</p>
                        <p className="text-xs text-muted-foreground">{v.sub}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ManualMeetingFallback({
    city,
    onCancel,
    onSubmit,
}: {
    city: DummyCity;
    onCancel: () => void;
    onSubmit: (data: { date: string; body: string }) => void;
}) {
    const [date, setDate] = React.useState("");
    const [body, setBody] = React.useState(ADMIN_BODIES[0]);

    return (
        <Alert className="border-amber-300 bg-amber-50/60">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle>Το meeting σας δεν είναι στη λίστα;</AlertTitle>
            <AlertDescription>
                <p className="mb-3 text-sm">
                    Συμπληρώστε τα στοιχεία της συνεδρίασης για τον {city.name} και θα τη συσχετίσουμε χειροκίνητα.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <Label htmlFor="manual-date" className="text-xs">Ημερομηνία συνεδρίασης</Label>
                        <Input id="manual-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="manual-body" className="text-xs">Τύπος συνεδρίασης</Label>
                        <Select value={body} onValueChange={setBody}>
                            <SelectTrigger id="manual-body" className="mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ADMIN_BODIES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={onCancel}>Ακύρωση</Button>
                    <Button size="sm" disabled={!date} onClick={() => onSubmit({ date, body })}>
                        Συνέχεια στο ανέβασμα
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant A — pre-filled from email link
// ─────────────────────────────────────────────────────────────────────────────
function VariantA({ city, meeting }: { city: DummyCity; meeting: DummyMeeting }) {
    const [simulateFail, setSimulateFail] = React.useState(false);
    const [resetKey, setResetKey] = React.useState(0);
    return (
        <div className="space-y-5">
            <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                    <Mail className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium">Καλώς ήρθατε από το email του OpenCouncil</p>
                    <p className="text-xs text-muted-foreground">
                        Ο σύνδεσμος είναι προσωπικός και προ-συμπληρωμένος για τη συγκεκριμένη συνεδρίαση. Δεν χρειάζεται login.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{city.name}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">Προσδιορισμένο</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{meeting.administrativeBody} — {meeting.title}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">{formatGreekDate(meeting.dateTime)}</p>
            </div>

            <MockDragDrop simulateNetworkFail={simulateFail} resetKey={resetKey} />

            <DemoControls
                simulateFail={simulateFail}
                onSimulateFailChange={setSimulateFail}
                onReset={() => setResetKey(k => k + 1)}
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant B — public wizard
// ─────────────────────────────────────────────────────────────────────────────
function VariantB() {
    const [cityId, setCityId] = React.useState<string>("");
    const [meetingId, setMeetingId] = React.useState<string>("");
    const [showManual, setShowManual] = React.useState(false);
    const [manualData, setManualData] = React.useState<{ date: string; body: string } | null>(null);
    const [simulateFail, setSimulateFail] = React.useState(false);
    const [resetKey, setResetKey] = React.useState(0);

    const city = DUMMY_CITIES.find(c => c.id === cityId) ?? null;
    const meetingsForCity = DUMMY_MEETINGS.filter(m => m.cityId === cityId);
    const meeting = meetingsForCity.find(m => m.id === meetingId) ?? null;
    const ready = !!city && (!!meeting || !!manualData);

    return (
        <div className="space-y-5">
            <Step n={1} title="Επιλέξτε δήμο" done={!!city}>
                <Select value={cityId} onValueChange={(v) => { setCityId(v); setMeetingId(""); setManualData(null); setShowManual(false); }}>
                    <SelectTrigger><SelectValue placeholder="— Επιλέξτε δήμο —" /></SelectTrigger>
                    <SelectContent>
                        {DUMMY_CITIES.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </Step>

            <Step n={2} title="Επιλέξτε συνεδρίαση" disabled={!city} done={!!meeting || !!manualData}>
                {city && !manualData && (
                    <>
                        <Select value={meetingId} onValueChange={setMeetingId}>
                            <SelectTrigger><SelectValue placeholder="— Επιλέξτε συνεδρίαση —" /></SelectTrigger>
                            <SelectContent>
                                {meetingsForCity.map(m => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {formatGreekDate(m.dateTime)} — {m.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!showManual && (
                            <button type="button" onClick={() => setShowManual(true)} className="text-xs text-primary underline underline-offset-2 mt-2">
                                Το meeting μου δεν είναι εδώ
                            </button>
                        )}
                    </>
                )}
                {city && showManual && !manualData && (
                    <ManualMeetingFallback
                        city={city}
                        onCancel={() => setShowManual(false)}
                        onSubmit={(data) => { setManualData(data); setMeetingId(""); }}
                    />
                )}
                {manualData && city && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between">
                        <div>
                            <p className="font-medium">{manualData.body}</p>
                            <p className="text-xs text-muted-foreground">Χειροκίνητα: {manualData.date}</p>
                        </div>
                        <button type="button" onClick={() => setManualData(null)} className="text-xs text-primary underline">Αλλαγή</button>
                    </div>
                )}
            </Step>

            <Step n={3} title="Ανεβάστε το αρχείο" disabled={!ready}>
                {ready ? (
                    <MockDragDrop simulateNetworkFail={simulateFail} resetKey={resetKey} />
                ) : (
                    <p className="text-sm text-muted-foreground">Συμπληρώστε πρώτα τα βήματα 1 και 2.</p>
                )}
            </Step>

            {ready && (
                <DemoControls
                    simulateFail={simulateFail}
                    onSimulateFailChange={setSimulateFail}
                    onReset={() => setResetKey(k => k + 1)}
                />
            )}
        </div>
    );
}

function Step({ n, title, disabled, done, children }: { n: number; title: string; disabled?: boolean; done?: boolean; children: React.ReactNode }) {
    return (
        <div className={`rounded-lg border p-4 ${disabled ? "opacity-50" : ""} ${done ? "border-primary/40 bg-primary/[0.03]" : ""}`}>
            <div className="flex items-center gap-2 mb-3">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${done ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {done ? "✓" : n}
                </div>
                <h3 className="text-sm font-medium">{title}</h3>
            </div>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant C — filename parsing
// ─────────────────────────────────────────────────────────────────────────────
function VariantC() {
    const [parsed, setParsed] = React.useState<ReturnType<typeof fakeParseFilename>>(null);
    const [confirmed, setConfirmed] = React.useState(false);
    const [pickedFile, setPickedFile] = React.useState<File | null>(null);
    const [showManual, setShowManual] = React.useState(false);
    const [manualCity, setManualCity] = React.useState<string>("");
    const [manualData, setManualData] = React.useState<{ date: string; body: string } | null>(null);
    const [simulateFail, setSimulateFail] = React.useState(false);
    const [resetKey, setResetKey] = React.useState(0);

    const reset = () => {
        setParsed(null);
        setConfirmed(false);
        setPickedFile(null);
        setShowManual(false);
        setManualCity("");
        setManualData(null);
        setResetKey(k => k + 1);
    };

    // If the file is dropped first, we intercept onFileSelected to attempt parsing
    if (!confirmed) {
        return (
            <div className="space-y-5">
                <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>Ξεκινήστε σύροντας το αρχείο</AlertTitle>
                    <AlertDescription>
                        Θα προσπαθήσουμε να μαντέψουμε δήμο και συνεδρίαση από το όνομα του αρχείου (π.χ. <code className="text-xs">syn_dimou_athina_2026_05_15.mp4</code>).
                    </AlertDescription>
                </Alert>

                {/* Inert drop zone that hijacks the file before upload starts */}
                <InertDrop
                    onFile={(f) => {
                        setPickedFile(f);
                        const p = fakeParseFilename(f.name);
                        setParsed(p);
                        if (!p) setShowManual(true);
                    }}
                />

                {parsed && pickedFile && (
                    <Card className="border-primary/40">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Βρήκαμε αντιστοίχιση
                            </CardTitle>
                            <CardDescription className="text-xs">Confidence: {Math.round(parsed.confidence * 100)}%</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                                <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {parsed.city.name}</div>
                                <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {parsed.meeting.administrativeBody} — {parsed.meeting.title}</div>
                                <div className="text-xs text-muted-foreground pl-5">{formatGreekDate(parsed.meeting.dateTime)}</div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => setConfirmed(true)}>
                                    Σωστά — συνέχεια
                                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setParsed(null); setShowManual(true); }}>
                                    Διόρθωση χειροκίνητα
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {showManual && pickedFile && !parsed && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Δεν αναγνωρίσαμε το αρχείο</CardTitle>
                            <CardDescription className="text-xs">
                                Από το όνομα <code className="text-xs">{pickedFile.name}</code> δεν μπορέσαμε να μαντέψουμε. Συμπληρώστε χειροκίνητα.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Select value={manualCity} onValueChange={setManualCity}>
                                <SelectTrigger><SelectValue placeholder="— Επιλέξτε δήμο —" /></SelectTrigger>
                                <SelectContent>
                                    {DUMMY_CITIES.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {manualCity && !manualData && (
                                <ManualMeetingFallback
                                    city={DUMMY_CITIES.find(c => c.id === manualCity)!}
                                    onCancel={() => setManualCity("")}
                                    onSubmit={(d) => { setManualData(d); setConfirmed(true); }}
                                />
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="rounded-lg border bg-primary/[0.04] p-4 flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-primary mt-1" />
                <div className="flex-1 text-sm">
                    {parsed && (
                        <>
                            <p className="font-medium">{parsed.city.name}</p>
                            <p className="text-xs text-muted-foreground">{parsed.meeting.administrativeBody} — {formatGreekDate(parsed.meeting.dateTime)}</p>
                        </>
                    )}
                    {manualData && (
                        <>
                            <p className="font-medium">{DUMMY_CITIES.find(c => c.id === manualCity)?.name}</p>
                            <p className="text-xs text-muted-foreground">{manualData.body} — {manualData.date}</p>
                        </>
                    )}
                </div>
                <button type="button" onClick={reset} className="text-xs text-primary underline self-start">Αλλαγή</button>
            </div>

            {pickedFile && (
                <SimulatedConfirmedUpload file={pickedFile} simulateFail={simulateFail} resetKey={resetKey} />
            )}

            <DemoControls
                simulateFail={simulateFail}
                onSimulateFailChange={setSimulateFail}
                onReset={() => setResetKey(k => k + 1)}
            />
        </div>
    );
}

/** A drop zone that captures the file but doesn't start the upload (for Variant C). */
function InertDrop({ onFile }: { onFile: (f: File) => void }) {
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    return (
        <div
            className={`relative rounded-xl border-2 border-dashed p-10 transition-all ${
                isDragging ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-muted-foreground/30 bg-muted/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        >
            <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-full bg-primary/10 p-4">
                    <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <div>
                    <p className="text-base font-medium">Σύρετε το αρχείο εδώ</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        ή{" "}
                        <button type="button" className="text-primary underline underline-offset-2" onClick={() => inputRef.current?.click()}>
                            επιλέξτε από τον υπολογιστή
                        </button>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Θα προσπαθήσουμε να μαντέψουμε δήμο &amp; συνεδρίαση</p>
                </div>
            </div>
            <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".mp4,.mov,.mkv,.mp3,.wav,.m4a"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ""; } }}
            />
        </div>
    );
}

/** A version of MockDragDrop that starts immediately with a known file (no idle state). */
function SimulatedConfirmedUpload({ file, simulateFail, resetKey }: { file: File; simulateFail: boolean; resetKey: number }) {
    // Re-mount the MockDragDrop each time resetKey changes; we pass simulateFail through.
    // For the "confirmed" path in Variant C we just reuse MockDragDrop but auto-trigger via key.
    const [innerKey, setInnerKey] = React.useState(0);
    React.useEffect(() => { setInnerKey(k => k + 1); }, [resetKey]);

    return <AutoStartingDrop key={innerKey} initialFile={file} simulateFail={simulateFail} />;
}

/** Wraps MockDragDrop but immediately injects an initial file. */
function AutoStartingDrop({ initialFile, simulateFail }: { initialFile: File; simulateFail: boolean }) {
    const [resetKey] = React.useState(0);
    const ref = React.useRef<HTMLDivElement>(null);

    // We cannot easily push an external file into MockDragDrop without modifying it,
    // so for the confirmed-upload visual we render a static "upload in progress"
    // panel that mimics the same look but auto-completes.
    const [progress, setProgress] = React.useState(0);
    const [done, setDone] = React.useState(false);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let p = 0;
        const id = setInterval(() => {
            p += Math.random() * 8 + 2;
            if (simulateFail && p >= 45) {
                setFailed(true);
                clearInterval(id);
                return;
            }
            if (p >= 100) {
                setProgress(100);
                clearInterval(id);
                setTimeout(() => setDone(true), 250);
                return;
            }
            setProgress(Math.floor(p));
        }, 180);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulateFail]);

    return (
        <div ref={ref} className={`rounded-xl border-2 border-dashed p-8 ${done ? "border-green-500/50 bg-green-50/40" : failed ? "border-destructive/50 bg-destructive/5" : "border-muted-foreground/30 bg-muted/30"}`}>
            {done && (
                <div className="flex flex-col items-center text-center gap-2">
                    <div className="rounded-full bg-green-100 p-3"><span className="text-green-700 text-xl">✓</span></div>
                    <p className="font-medium text-green-900">Επιτυχές ανέβασμα</p>
                    <p className="text-sm text-muted-foreground truncate max-w-md">{initialFile.name}</p>
                </div>
            )}
            {failed && (
                <div className="flex flex-col items-center text-center gap-2">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                    <p className="font-medium text-destructive">Αποτυχία ανεβάσματος (network)</p>
                    <p className="text-xs text-muted-foreground">Επαναλάβετε στο πραγματικό σύστημα — το demo απενεργοποιεί το αυτόματο retry.</p>
                </div>
            )}
            {!done && !failed && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2"><span className="text-primary">⬆</span></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{initialFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(initialFile.size / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">{progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">Ανέβασμα… μην κλείσετε το παράθυρο.</p>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo controls (visible in mockup only)
// ─────────────────────────────────────────────────────────────────────────────
function DemoControls({
    simulateFail,
    onSimulateFailChange,
    onReset,
}: {
    simulateFail: boolean;
    onSimulateFailChange: (v: boolean) => void;
    onReset: () => void;
}) {
    return (
        <div className="rounded-md border border-dashed border-amber-400 bg-amber-50/40 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-900">
                <Info className="h-3.5 w-3.5" />
                <span>Demo controls (μόνο για mockup screenshots)</span>
            </div>
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                    <Switch checked={simulateFail} onCheckedChange={onSimulateFailChange} />
                    Network fail
                </label>
                <Button size="sm" variant="ghost" onClick={onReset} className="h-7 px-2 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                </Button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level component
// ─────────────────────────────────────────────────────────────────────────────
export function UploadMockup() {
    const searchParams = useSearchParams();
    const variant: Variant = (searchParams.get("variant") as Variant) || "a";
    const cityId = searchParams.get("city") || "athens";
    const meetingId = searchParams.get("meeting") || "athens-2026-05-15";

    const city = DUMMY_CITIES.find(c => c.id === cityId) ?? DUMMY_CITIES[0];
    const meeting =
        DUMMY_MEETINGS.find(m => m.id === meetingId && m.cityId === city.id) ??
        DUMMY_MEETINGS.find(m => m.cityId === city.id) ??
        DUMMY_MEETINGS[0];

    return (
        <div className="min-h-screen flex flex-col items-center justify-start px-4 pt-8 pb-12 sm:pt-12">
            <div className="w-full max-w-2xl mx-auto">
                <div className="text-center mb-6 sm:mb-8">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-normal leading-tight">
                        Ανεβάστε ηχογράφηση συνεδρίασης στο{" "}
                        <span className="relative z-10 text-[hsl(var(--orange))]">OpenCouncil</span>
                    </h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-3">
                        Χωρίς εγγραφή. Στείλτε μας απευθείας το βίντεο ή τον ήχο της συνεδρίασης.
                    </p>
                </div>

                <VariantSwitcher current={variant} />

                <Card>
                    <CardContent className="p-5 sm:p-6">
                        {variant === "a" && <VariantA city={city} meeting={meeting} />}
                        {variant === "b" && <VariantB />}
                        {variant === "c" && <VariantC />}
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center mt-4">
                    Mockup για το <a href="https://github.com/schemalabz/opencouncil/issues/300" className="underline">issue #300</a>.
                    Καμία πραγματική αποστολή αρχείων.
                </p>
            </div>
        </div>
    );
}
