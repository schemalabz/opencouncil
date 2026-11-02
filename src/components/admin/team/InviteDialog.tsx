"use client";

import { FormEvent, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { GrantRole, Realm } from "@prisma/client";
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
import { GRANT_ROLES } from "@/lib/auth/rights";
import { getRealmDomain } from "@/lib/realm";
import { toast } from "@/hooks/use-toast";
import { isGrantErrorCode, type InviteGrantRequest } from "@/lib/zod-schemas/user";
import type { GrantScopes, InvitedGrant } from "@/lib/db/grants";

type ScopeKind = 'realm' | 'city' | 'body';

const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * The invite form of the team page (#875). A realm admin invites on a city
 * or a body of their realms; a superadmin can also invite on a realm.
 */
export function InviteDialog({ open, onOpenChange, scopes, superadmin, onInvited }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scopes: GrantScopes;
    superadmin: boolean;
    onInvited: () => void;
}) {
    const t = useTranslations("team");
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState<GrantRole>("admin");
    const [kind, setKind] = useState<ScopeKind>("city");
    const [realm, setRealm] = useState<Realm | "">("");
    const [cityId, setCityId] = useState("");
    const [bodyId, setBodyId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const bodies = useMemo(() => scopes.bodies.filter(b => b.cityId === cityId), [scopes.bodies, cityId]);

    const scope: InviteGrantRequest['scope'] | null =
        kind === 'realm' ? (realm ? { realm } : null)
            : kind === 'city' ? (cityId ? { cityId } : null)
                : bodyId ? { administrativeBodyId: bodyId } : null;

    const reset = () => {
        setEmail("");
        setName("");
        setRole("admin");
        setKind("city");
        setRealm("");
        setCityId("");
        setBodyId("");
        setError(null);
    };

    const close = (next: boolean) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!scope) return;
        setBusy(true);
        setError(null);
        const body: InviteGrantRequest = { email, name: name.trim() || null, role, scope };
        try {
            const response = await fetch('/api/admin/grants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (response.ok) {
                const invited: Partial<InvitedGrant> | null = await response.json().catch(() => null);
                if (invited?.inviteEmailSent === false) {
                    toast({ title: t('dialog.emailFailed'), variant: 'destructive' });
                }
                reset();
                onOpenChange(false);
                onInvited();
                return;
            }
            const json: unknown = await response.json().catch(() => null);
            const code = json && typeof json === 'object' && 'error' in json ? json.error : undefined;
            setError(isGrantErrorCode(code) ? t(`errors.${code}`) : t('errorGeneric'));
        } catch {
            setError(t('errorGeneric'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{t("dialog.title")}</DialogTitle>
                        <DialogDescription>{t("dialog.description")}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="invite-email">{t("dialog.email")}</Label>
                        <Input id="invite-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="invite-name">{t("dialog.name")}</Label>
                        <Input id="invite-name" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="invite-role">{t("dialog.role")}</Label>
                        <select id="invite-role" className={selectClass} value={role} onChange={e => setRole(e.target.value as GrantRole)}>
                            {GRANT_ROLES.map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="invite-kind">{t("dialog.scopeKind")}</Label>
                        <select id="invite-kind" className={selectClass} value={kind} onChange={e => setKind(e.target.value as ScopeKind)}>
                            {superadmin && <option value="realm">{t("scopeKind.realm")}</option>}
                            <option value="city">{t("scopeKind.city")}</option>
                            <option value="body">{t("scopeKind.body")}</option>
                        </select>
                    </div>
                    {kind === 'realm' && (
                        <div className="space-y-2">
                            <Label htmlFor="invite-realm">{t("dialog.realm")}</Label>
                            <select id="invite-realm" className={selectClass} required value={realm} onChange={e => setRealm(e.target.value as Realm)}>
                                <option value="">{t("dialog.pick")}</option>
                                {scopes.realms.map(r => <option key={r} value={r}>{getRealmDomain(r)}</option>)}
                            </select>
                        </div>
                    )}
                    {kind !== 'realm' && (
                        <div className="space-y-2">
                            <Label htmlFor="invite-city">{t("dialog.city")}</Label>
                            <select id="invite-city" className={selectClass} required value={cityId} onChange={e => { setCityId(e.target.value); setBodyId(""); }}>
                                <option value="">{t("dialog.pick")}</option>
                                {scopes.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}
                    {kind === 'body' && (
                        <div className="space-y-2">
                            <Label htmlFor="invite-body">{t("dialog.body")}</Label>
                            <select id="invite-body" className={selectClass} required value={bodyId} onChange={e => setBodyId(e.target.value)} disabled={!cityId}>
                                <option value="">{t("dialog.pick")}</option>
                                {bodies.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                            {t("dialog.cancel")}
                        </Button>
                        <Button type="submit" disabled={busy || !scope}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            {busy ? t("dialog.sending") : t("dialog.submit")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
