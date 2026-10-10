"use client";
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { BodyAdmin } from '@/lib/db/bodyAdmins';
import { formatDate } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';

interface BodyAdminsCardProps {
    cityId: string;
    bodyId: string;
    /** An admin of the city may remove the last admin of the body; a body admin may not. */
    canRemoveLast: boolean;
}

/** The admins of the body (#828): the accounts that run it, and a form that invites one more by email. */
export function BodyAdminsCard({ cityId, bodyId, canRemoveLast }: BodyAdminsCardProps) {
    const t = useTranslations('body');
    const locale = useLocale();
    const { toast } = useToast();
    const [admins, setAdmins] = useState<BodyAdmin[] | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const url = `/api/cities/${cityId}/administrative-bodies/${bodyId}/admins`;

    const load = useCallback(async () => {
        const response = await fetch(url);
        if (response.ok) setAdmins(await response.json());
    }, [url]);

    useEffect(() => { load(); }, [load]);

    async function failure(response: Response, fallback: string): Promise<string> {
        const data = await response.json().catch(() => null);
        if (typeof data?.error === 'string') return data.error;
        if (Array.isArray(data?.error) && typeof data.error[0]?.message === 'string') return data.error[0].message;
        return fallback;
    }

    async function invite(event: React.FormEvent) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
            });
            if (!response.ok) throw new Error(await failure(response, t('inviteFailed')));
            const result: { created: boolean; inviteEmailSent: boolean } = await response.json();
            toast({ title: result.created ? t('inviteSent') : t('adminAdded') });
            setEmail('');
            setName('');
            await load();
        } catch (inviteError) {
            setError(inviteError instanceof Error ? inviteError.message : t('inviteFailed'));
        } finally {
            setBusy(false);
        }
    }

    async function remove(admin: BodyAdmin) {
        if (!window.confirm(t('removeConfirm', { name: admin.name || admin.email }))) return;
        setError(null);
        setBusy(true);
        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: admin.userId }),
            });
            if (!response.ok) throw new Error(await failure(response, t('removeFailed')));
            toast({ title: t('removed') });
            await load();
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : t('removeFailed'));
        } finally {
            setBusy(false);
        }
    }

    const lastOne = admins?.length === 1 && !canRemoveLast;

    return (
        <section className={cn(surfaceCardClass, 'space-y-5 p-5')}>
            <div>
                <h2 className="!m-0 !text-left text-lg">{t('adminsTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('adminsIntro')}</p>
            </div>
            {admins === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={t('loading')} />
            ) : (
                <ul className="divide-y divide-border rounded-lg border">
                    {admins.map(admin => (
                        <li key={admin.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{admin.name || admin.email}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {admin.name ? `${admin.email} · ` : ''}
                                    {admin.onboarded
                                        ? t('adminSince', { date: formatDate(new Date(admin.since), undefined, locale) })
                                        : t('invitePending')}
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busy || lastOne}
                                title={lastOne ? t('lastAdmin') : t('remove')}
                                onClick={() => remove(admin)}
                            >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                <span className="sr-only">{t('remove')}</span>
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                    <Label htmlFor="body-admin-email">{t('inviteEmail')}</Label>
                    <Input id="body-admin-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="body-admin-name">{t('inviteName')}</Label>
                    <Input id="body-admin-name" value={name} onChange={event => setName(event.target.value)} />
                </div>
                <Button type="submit" disabled={busy || !email.trim()}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" aria-hidden />}
                    {t('invite')}
                </Button>
            </form>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </section>
    );
}
