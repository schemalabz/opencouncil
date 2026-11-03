"use client";

import { FormEvent, useId, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRANT_ROLES } from "@/lib/auth/rights";
import { getRealmDomain } from "@/lib/realm";
import { toast } from "@/hooks/use-toast";
import { grantErrorCodeOf, type InviteGrantRequest } from "@/lib/zod-schemas/user";
import type { GrantScopes, InvitedGrant } from "@/lib/db/grants";

type ScopeKind = 'realm' | 'city' | 'body' | 'party';

type InviteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scopes: GrantScopes;
    superadmin: boolean;
    /** The city of a Team tab: every scope offered sits in it, so none picks a city. */
    city?: { id: string; name: string };
    onInvited: (invited: InvitedGrant) => void;
};

/**
 * The invite form of the team (#875). The role is a list of cards, each
 * saying what it carries, so the sender sees the whole ladder before
 * picking a rung. The scope is a kind, then the one entity of that kind.
 */
export function InviteDialog({ open, onOpenChange, scopes, superadmin, city, onInvited }: InviteDialogProps) {
    const t = useTranslations("team");
    const id = useId();

    // The kinds the viewer may invite on: a realm for a superadmin on the
    // admin page, and a body or a party only where there is one to pick.
    const kinds = useMemo(() => {
        const list: ScopeKind[] = [];
        if (superadmin && !city && scopes.realms.length > 0) list.push('realm');
        if (scopes.cities.length > 0) list.push('city');
        if (scopes.bodies.length > 0) list.push('body');
        if (scopes.parties.length > 0) list.push('party');
        return list;
    }, [superadmin, city, scopes]);
    const firstKind = kinds[0] ?? 'city';

    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [role, setRole] = useState<GrantRole | null>(null);
    const [kind, setKind] = useState<ScopeKind>(firstKind);
    const [realm, setRealm] = useState<Realm | "">("");
    const [cityId, setCityId] = useState(city?.id ?? "");
    const [entityId, setEntityId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const bodies = useMemo(() => scopes.bodies.filter((body) => body.cityId === cityId), [scopes.bodies, cityId]);
    const parties = useMemo(() => scopes.parties.filter((party) => party.cityId === cityId), [scopes.parties, cityId]);

    // A body admin holds one body, often: the only option is the pick.
    const entities = kind === 'body' ? bodies : kind === 'party' ? parties : [];
    const entity = entityId || (entities.length === 1 ? entities[0].id : "");

    const scope: InviteGrantRequest['scope'] | null =
        kind === 'realm' ? (realm ? { realm } : null)
            : kind === 'city' ? (cityId ? { cityId } : null)
                : kind === 'body' ? (entity ? { administrativeBodyId: entity } : null)
                    : entity ? { partyId: entity } : null;

    const pickKind = (next: ScopeKind) => {
        setKind(next);
        setEntityId("");
    };

    const pickCity = (next: string) => {
        setCityId(next);
        setEntityId("");
    };

    const reset = () => {
        setEmail("");
        setName("");
        setRole(null);
        setKind(firstKind);
        setRealm("");
        setCityId(city?.id ?? "");
        setEntityId("");
        setError(null);
    };

    const close = (next: boolean) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!scope || !role) return;
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
                const invited: InvitedGrant = await response.json();
                if (invited.inviteEmailSent === false) {
                    toast({ title: t('dialog.emailFailed'), variant: 'destructive' });
                }
                reset();
                onOpenChange(false);
                onInvited(invited);
                return;
            }
            const code = await grantErrorCodeOf(response);
            setError(code ? t(`errors.${code}`) : t('errorGeneric'));
        } catch {
            setError(t('errorGeneric'));
        } finally {
            setBusy(false);
        }
    };

    const picker = (key: string, label: string, value: string, onChange: (next: string) => void, options: { value: string; label: string }[]) => (
        <div className="space-y-2">
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={`${id}-${key}`}>
                    <SelectValue placeholder={t("dialog.pick")} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {/* The dialog centers its items; a form reads left-aligned. */}
                <form onSubmit={submit} className="w-full space-y-5 text-left">
                    <DialogHeader>
                        <DialogTitle>{t("dialog.title")}</DialogTitle>
                        <DialogDescription>{t("dialog.description")}</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor={`${id}-email`}>{t("dialog.email")}</Label>
                            <Input id={`${id}-email`} type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${id}-name`}>{t("dialog.name")}</Label>
                            <Input id={`${id}-name`} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                    </div>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium leading-none">{t("dialog.role")}</legend>
                        <div className="grid gap-1.5">
                            {GRANT_ROLES.map((option) => (
                                <label
                                    key={option}
                                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-input px-3 py-2 transition-colors hover:bg-muted/60 has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                                >
                                    <input
                                        type="radio"
                                        name={`${id}-role`}
                                        value={option}
                                        checked={role === option}
                                        onChange={() => setRole(option)}
                                        className="mt-1 h-3.5 w-3.5 accent-foreground"
                                    />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium">{t(`role.${option}`)}</span>
                                        <span className="block text-xs leading-snug text-muted-foreground">{t(`roleHint.${option}`)}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {kinds.length > 1 && (
                        <fieldset>
                            <legend className="text-sm font-medium leading-none">{t("dialog.scopeKind")}</legend>
                            <div className="mt-2 inline-flex flex-wrap gap-1 rounded-lg border border-input bg-muted/40 p-1">
                                {kinds.map((option) => (
                                    <label
                                        key={option}
                                        className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                                    >
                                        <input
                                            type="radio"
                                            name={`${id}-kind`}
                                            value={option}
                                            checked={kind === option}
                                            onChange={() => pickKind(option)}
                                            className="sr-only"
                                        />
                                        {t(`scopeKind.${option}`)}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}

                    {kind === 'realm' && picker('realm', t("dialog.realm"), realm, (next) => setRealm(next as Realm), scopes.realms.map((option) => ({ value: option, label: getRealmDomain(option) })))}
                    {kind !== 'realm' && !city && picker('city', t("dialog.city"), cityId, pickCity, scopes.cities.map((option) => ({ value: option.id, label: option.name })))}
                    {kind === 'city' && city && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("dialog.wholeCity", { city: city.name })}</p>
                    )}
                    {kind === 'body' && (city || cityId) && picker('body', t("dialog.body"), entity, setEntityId, bodies.map((option) => ({ value: option.id, label: option.name })))}
                    {kind === 'party' && (city || cityId) && picker('party', t("dialog.party"), entity, setEntityId, parties.map((option) => ({ value: option.id, label: option.name })))}

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                            {t("dialog.cancel")}
                        </Button>
                        <Button type="submit" disabled={busy || !scope || !role}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            {busy ? t("dialog.sending") : t("dialog.submit")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
