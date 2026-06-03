'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { municipalityLogos } from './mockData';
import { Eyebrow } from './shared';

const STEPS = ['Στοιχεία', 'Δήμος', 'Έτοιμο'];

/**
 * Multi-step Εγγραφή flow (from the design): details → municipality → done.
 * Trigger + dialog are co-located; pass the trigger as children.
 */
export function SignupDialog({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [muni, setMuni] = useState('');

    const onOpenChange = (o: boolean) => {
        setOpen(o);
        if (o) {
            setStep(0);
            setName('');
            setEmail('');
            setMuni('');
        }
    };

    const muniName = municipalityLogos.find((m) => m.id === muni)?.shortName;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <Eyebrow className="text-[hsl(var(--orange))]">Εγγραφή · δωρεάν</Eyebrow>
                <Stepper step={step} />

                {step === 0 && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <DialogTitle className="text-2xl font-bold">Φτιάξε τον λογαριασμό σου</DialogTitle>
                            <DialogDescription>30 δευτερόλεπτα. Χωρίς κόστος, χωρίς διαφημίσεις.</DialogDescription>
                        </div>
                        <Field label="Όνομα">
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Το όνομά σου" />
                        </Field>
                        <Field label="Email">
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@email.gr"
                            />
                        </Field>
                        <Button
                            disabled={!email}
                            onClick={() => setStep(1)}
                            className="w-full rounded-full bg-[hsl(var(--orange))] text-white hover:bg-[hsl(var(--orange))]/90"
                        >
                            Συνέχεια <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <DialogTitle className="text-2xl font-bold">Ποιον δήμο να παρακολουθώ;</DialogTitle>
                            <DialogDescription>
                                Διάλεξε τον δήμο σου — μπορείς να προσθέσεις κι άλλους αργότερα.
                            </DialogDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {municipalityLogos.map((m) => (
                                <Chip key={m.id} active={muni === m.id} onClick={() => setMuni(m.id)}>
                                    {m.shortName}
                                </Chip>
                            ))}
                        </div>
                        <Button
                            disabled={!muni}
                            onClick={() => setStep(2)}
                            className="w-full rounded-full bg-[hsl(var(--orange))] text-white hover:bg-[hsl(var(--orange))]/90"
                        >
                            Ολοκλήρωση <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                )}

                {step === 2 && (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--orange))]/15 text-[hsl(var(--orange))]">
                            <Check className="h-8 w-8" />
                        </span>
                        <DialogTitle className="text-2xl font-bold">Καλώς ήρθες!</DialogTitle>
                        <DialogDescription>
                            Στείλαμε επιβεβαίωση στο <b className="text-foreground">{email || 'email σου'}</b>. Θα
                            παρακολουθείς τον δήμο <b className="text-foreground">{muniName}</b>.
                        </DialogDescription>
                        <Button
                            onClick={() => onOpenChange(false)}
                            className="mt-2 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            Τέλεια, ας ξεκινήσουμε
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Stepper({ step }: { step: number }) {
    return (
        <div className="flex gap-2">
            {STEPS.map((label, i) => (
                <div key={i} className="flex flex-1 items-center gap-2">
                    <span
                        className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                            i === step && 'border-[hsl(var(--orange))] bg-[hsl(var(--orange))] text-white',
                            i < step && 'border-primary bg-primary text-primary-foreground',
                            i > step && 'border-border bg-muted text-muted-foreground',
                        )}
                    >
                        {i < step ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className={cn('text-xs font-semibold', i === step ? 'text-foreground' : 'text-muted-foreground')}>
                        {label}
                    </span>
                </div>
            ))}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

export function Chip({
    active,
    onClick,
    children,
}: {
    active?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-full border px-3 py-2 text-sm font-semibold transition-colors',
                active
                    ? 'border-[hsl(var(--orange))] bg-[hsl(var(--orange))] text-white'
                    : 'border-border bg-muted text-muted-foreground hover:border-muted-foreground',
            )}
        >
            {children}
        </button>
    );
}
