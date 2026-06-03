'use client';

import { useState } from 'react';
import { ArrowRight, Bell } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { topicChips } from './mockData';
import { Chip } from './SignupDialog';
import { Eyebrow } from './shared';

/**
 * Ειδοποιήσεις flow (from the design): pick scope + topics + email → success.
 * Optionally scoped to a municipality (its name shown as a scope option).
 */
export function NotifyDialog({ muniName, children }: { muniName?: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [scope, setScope] = useState<'all' | 'muni'>('all');
    const [topics, setTopics] = useState<string[]>([]);
    const [email, setEmail] = useState('');
    const [done, setDone] = useState(false);

    const onOpenChange = (o: boolean) => {
        setOpen(o);
        if (o) {
            setScope(muniName ? 'muni' : 'all');
            setTopics([]);
            setEmail('');
            setDone(false);
        }
    };

    const toggle = (t: string) =>
        setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                {!done ? (
                    <div className="space-y-4">
                        <Eyebrow className="inline-flex items-center gap-1.5 text-[hsl(var(--orange))]">
                            <Bell className="h-3 w-3" /> Ειδοποιήσεις
                        </Eyebrow>
                        <div className="space-y-1">
                            <DialogTitle className="text-2xl font-bold">Ειδοποιήσου μόνο για ό,τι σε αφορά</DialogTitle>
                            <DialogDescription>
                                Σου στέλνουμε ειδοποίηση μόλις ένα θέμα συζητηθεί σε συμβούλιο — χωρίς να ψάχνεις.
                            </DialogDescription>
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs font-bold text-muted-foreground">Δήμος</span>
                            <div className="inline-flex gap-1 rounded-full border border-border bg-muted p-1">
                                <Seg active={scope === 'all'} onClick={() => setScope('all')}>
                                    Όλοι οι δήμοι
                                </Seg>
                                {muniName && (
                                    <Seg active={scope === 'muni'} onClick={() => setScope('muni')}>
                                        {muniName}
                                    </Seg>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="text-xs font-bold text-muted-foreground">Θέματα που σε ενδιαφέρουν</span>
                            <div className="flex flex-wrap gap-2">
                                {topicChips.map((t) => (
                                    <Chip key={t} active={topics.includes(t)} onClick={() => toggle(t)}>
                                        {t}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-muted-foreground">Email για ειδοποιήσεις</span>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@email.gr"
                            />
                        </label>

                        <Button
                            disabled={!email || topics.length === 0}
                            onClick={() => setDone(true)}
                            className="w-full rounded-full bg-[hsl(var(--orange))] text-white hover:bg-[hsl(var(--orange))]/90"
                        >
                            Ενεργοποίηση ειδοποιήσεων <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--orange))]/15 text-[hsl(var(--orange))]">
                            <Bell className="h-7 w-7" />
                        </span>
                        <DialogTitle className="text-2xl font-bold">Οι ειδοποιήσεις ενεργοποιήθηκαν</DialogTitle>
                        <DialogDescription>
                            Θα σε ειδοποιούμε στο <b className="text-foreground">{email}</b> για {topics.length} θέμα
                            {topics.length > 1 ? 'τα' : ''} {scope === 'all' ? 'σε όλους τους δήμους' : `στον δήμο ${muniName}`}.
                        </DialogDescription>
                        <div className="flex flex-wrap justify-center gap-2">
                            {topics.map((t) => (
                                <span
                                    key={t}
                                    className="rounded-full bg-[hsl(var(--orange))] px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                    {t}
                                </span>
                            ))}
                        </div>
                        <Button
                            onClick={() => onOpenChange(false)}
                            className="mt-2 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            Έτοιμο
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Seg({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
        >
            {children}
        </button>
    );
}
