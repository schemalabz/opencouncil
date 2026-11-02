"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { GRANT_TYPE_ICON } from "@/components/admin/users/administers";
import { InviteDialog } from "@/components/admin/team/InviteDialog";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/formatters/time";
import { getRealmDomain } from "@/lib/realm";
import { isGrantErrorCode } from "@/lib/zod-schemas/user";
import type { AdminEntityType } from "@/lib/db/adminEntities";
import type { GrantRow, GrantScopes } from "@/lib/db/grants";

const scopeOf = (row: GrantRow, cities: GrantScopes['cities']): { kind: AdminEntityType; name: string } => {
    const cityName = (cityId: string) => cities.find(c => c.id === cityId)?.name ?? cityId;
    if (row.realm) return { kind: 'realm', name: getRealmDomain(row.realm) };
    if (row.city) return { kind: 'city', name: row.city.name };
    if (row.administrativeBody) return { kind: 'body', name: `${cityName(row.administrativeBody.cityId)} / ${row.administrativeBody.name}` };
    if (row.party) return { kind: 'party', name: `${cityName(row.party.cityId)} / ${row.party.name}` };
    if (row.person) return { kind: 'person', name: `${cityName(row.person.cityId)} / ${row.person.name}` };
    return { kind: 'city', name: '—' };
};

const statusVariant: Record<GrantRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    pending: 'secondary',
    expired: 'outline',
    revoked: 'destructive',
};

/** The team page (#875): the grants a viewer may see, with invite and revoke. */
export function TeamTable({ grants: initial, scopes, superadmin }: {
    grants: GrantRow[];
    scopes: GrantScopes;
    superadmin: boolean;
}) {
    const t = useTranslations("team");
    const locale = useLocale();
    const router = useRouter();
    const [grants, setGrants] = useState(initial);
    const [showRevoked, setShowRevoked] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [revoking, setRevoking] = useState<GrantRow | null>(null);

    // revokeGrant refuses a claimed row, and leaves a realm or a person grant
    // to a superadmin, as canGrant does.
    const revocable = (row: GrantRow) =>
        row.status !== 'revoked' && !row.claimedAt && (superadmin || (!row.realm && !row.personId));

    // A rejected fetch (the network is down) shows the same toast as a failed response.
    const reload = async (includeRevoked = showRevoked) => {
        const response = await fetch(`/api/admin/grants${includeRevoked ? '?includeRevoked=1' : ''}`).catch(() => null);
        if (!response?.ok) {
            toast({ title: t('errorGeneric'), variant: 'destructive' });
            return;
        }
        setGrants(await response.json());
        router.refresh();
    };

    const toggleRevoked = async (next: boolean) => {
        setShowRevoked(next);
        await reload(next);
    };

    const revoke = async (row: GrantRow) => {
        const response = await fetch('/api/admin/grants', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grantId: row.id }),
        }).catch(() => null);
        if (response?.ok) {
            setRevoking(null);
            await reload();
            return;
        }
        const json: unknown = await response?.json().catch(() => null);
        const code = json && typeof json === 'object' && 'error' in json ? json.error : undefined;
        toast({
            title: t('revoke.failed'),
            description: isGrantErrorCode(code) ? t(`errors.${code}`) : t('errorGeneric'),
            variant: 'destructive',
        });
    };

    const visible = showRevoked ? grants : grants.filter(g => g.status !== 'revoked');

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <h1 className="text-2xl font-bold">{t("title")}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t("lead")}</p>
                </div>
                <Button onClick={() => setInviteOpen(true)}>
                    <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("invite")}
                </Button>
            </div>

            <div className="flex items-center gap-2">
                <Switch id="team-show-revoked" checked={showRevoked} onCheckedChange={toggleRevoked} />
                <Label htmlFor="team-show-revoked">{t("showRevoked")}</Label>
            </div>

            {visible.length === 0
                ? <p className="text-sm text-muted-foreground">{t("empty")}</p>
                : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("columns.name")}</TableHead>
                                <TableHead>{t("columns.email")}</TableHead>
                                <TableHead>{t("columns.role")}</TableHead>
                                <TableHead>{t("columns.scope")}</TableHead>
                                <TableHead>{t("columns.since")}</TableHead>
                                <TableHead>{t("columns.grantedBy")}</TableHead>
                                <TableHead>{t("columns.status")}</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.map(row => {
                                const scope = scopeOf(row, scopes.cities);
                                return (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">
                                            {row.user.name ?? <span className="text-muted-foreground">{t("noName")}</span>}
                                        </TableCell>
                                        <TableCell>{row.user.email}</TableCell>
                                        <TableCell><Badge variant="secondary">{t(`role.${row.role}`)}</Badge></TableCell>
                                        <TableCell title={t(`scopeKind.${scope.kind}`)}>
                                            <span aria-hidden="true" className="mr-1">{GRANT_TYPE_ICON[scope.kind]}</span>
                                            {scope.name}
                                        </TableCell>
                                        <TableCell>{formatDate(new Date(row.createdAt), undefined, locale)}</TableCell>
                                        <TableCell>{row.grantedBy?.name ?? row.grantedBy?.email ?? '—'}</TableCell>
                                        <TableCell><Badge variant={statusVariant[row.status]}>{t(`status.${row.status}`)}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            {revocable(row) && (
                                                <Button variant="ghost" size="sm" onClick={() => setRevoking(row)}>
                                                    {t("revoke.action")}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}

            <InviteDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                scopes={scopes}
                superadmin={superadmin}
                onInvited={() => { void reload(); }}
            />

            <ConfirmDeleteDialog
                open={revoking !== null}
                onOpenChange={open => { if (!open) setRevoking(null); }}
                title={t("revoke.title")}
                description={t("revoke.description")}
                itemName={revoking ? `${revoking.user.email} · ${scopeOf(revoking, scopes.cities).name}` : ''}
                onConfirm={() => revoking ? revoke(revoking) : Promise.resolve()}
            />
        </div>
    );
}
