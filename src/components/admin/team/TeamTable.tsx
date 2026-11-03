"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus, RotateCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { InviteDialog } from "@/components/admin/team/InviteDialog";
import { SCOPE_ICON } from "@/components/admin/team/scope";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatters/time";
import { PENDING_GRANT_DAYS } from "@/lib/auth/rights";
import { namedScope, scopeLabel, scopeOfGrant } from "@/lib/auth/grantScope";
import { isGrantErrorCode, type InviteGrantRequest } from "@/lib/zod-schemas/user";
import type { GrantRow, GrantScopes, InvitedGrant } from "@/lib/db/grants";

type TeamTableProps = {
    grants: GrantRow[];
    scopes: GrantScopes;
    superadmin: boolean;
    /** The city of a Team tab. The admin page has none, and names the city of each scope. */
    city?: { id: string; name: string };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `error` of a refused answer, when the body carries one. */
async function errorCodeOf(response: Response | null): Promise<string | undefined> {
    const json: unknown = await response?.json().catch(() => null);
    return json && typeof json === 'object' && 'error' in json && typeof json.error === 'string' ? json.error : undefined;
}

const jsonRequest = (method: 'POST' | 'DELETE', body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

/**
 * The team of a realm, a city or a body (#875): the members, the open
 * invitations, and the history behind a switch. The admin page and the Team
 * tab of a city share it; the tab fixes the city, and the API narrows the
 * list to what the viewer administers.
 */
export function TeamTable({ grants: initial, scopes, superadmin, city }: TeamTableProps) {
    const t = useTranslations("team");
    const locale = useLocale();
    const router = useRouter();
    const [grants, setGrants] = useState(initial);
    const [showHistory, setShowHistory] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [revoking, setRevoking] = useState<GrantRow | null>(null);
    const [resendingId, setResendingId] = useState<string | null>(null);

    const members = grants.filter((row) => row.status === 'active');
    const invitations = grants.filter((row) => row.status === 'pending' || row.status === 'expired');
    const history = grants.filter((row) => row.status === 'revoked');

    // Dates arrive as strings after a reload: the list is JSON then.
    const date = (value: Date | string) => formatDate(new Date(value), undefined, locale);
    const expiry = (row: GrantRow) => date(new Date(new Date(row.createdAt).getTime() + PENDING_GRANT_DAYS * DAY_MS));
    // On the Team tab every scope sits in the city, so its name is noise there.
    const label = (row: GrantRow) => (city ? namedScope(row).name : scopeLabel(namedScope(row)));
    const who = (row: GrantRow) => row.user.name ?? row.user.email;
    const describe = (row: GrantRow) => `${who(row)} · ${t(`role.${row.role}`)} · ${label(row)}`;

    // revokeGrant refuses a claimed row, and leaves a realm or a person grant
    // to a superadmin, as canGrant does.
    const revocable = (row: GrantRow) => !row.claimedAt && (superadmin || (!row.realm && !row.personId));

    const listUrl = (includeRevoked: boolean) => {
        const query = new URLSearchParams();
        if (city) query.set('cityId', city.id);
        if (includeRevoked) query.set('includeRevoked', '1');
        const text = query.toString();
        return `/api/admin/grants${text ? `?${text}` : ''}`;
    };

    // A rejected fetch (the network is down) shows the same toast as a failed response.
    const reload = async (includeRevoked = showHistory) => {
        const response = await fetch(listUrl(includeRevoked)).catch(() => null);
        if (!response?.ok) {
            toast({ title: t('errorGeneric'), variant: 'destructive' });
            return;
        }
        setGrants(await response.json());
        router.refresh();
    };

    const toggleHistory = async (next: boolean) => {
        setShowHistory(next);
        await reload(next);
    };

    const refused = async (title: string, response: Response | null) => {
        const code = await errorCodeOf(response);
        toast({ title, description: isGrantErrorCode(code) ? t(`errors.${code}`) : t('errorGeneric'), variant: 'destructive' });
    };

    const revoke = async (row: GrantRow) => {
        const verb = row.status === 'active' ? 'revoke' : 'withdraw';
        const response = await fetch('/api/admin/grants', jsonRequest('DELETE', { grantId: row.id })).catch(() => null);
        if (!response?.ok) {
            await refused(t(`${verb}.failed`), response);
            return;
        }
        setRevoking(null);
        toast({ title: t(`${verb}.done`) });
        await reload();
    };

    // A resend is an invite of the same role on the same scope: the API
    // supersedes the open row and writes a fresh one.
    const resend = async (row: GrantRow) => {
        setResendingId(row.id);
        const body: InviteGrantRequest = { email: row.user.email, name: row.user.name, role: row.role, scope: scopeOfGrant(row) };
        const response = await fetch('/api/admin/grants', jsonRequest('POST', body)).catch(() => null);
        setResendingId(null);
        if (!response?.ok) {
            await refused(t('resend.failed'), response);
            return;
        }
        const invited: Partial<InvitedGrant> | null = await response.json().catch(() => null);
        if (invited?.inviteEmailSent === false) toast({ title: t('dialog.emailFailed'), variant: 'destructive' });
        else toast({ title: t('resend.done', { email: row.user.email }) });
        await reload();
    };

    const invited = (grant: InvitedGrant) => {
        // The dialog already warned when the email did not go out.
        if (grant.inviteEmailSent !== false) {
            toast({
                title: grant.status === 'pending'
                    ? t('invited.pending', { email: grant.user.email })
                    : t('invited.active', { who: who(grant), role: t(`role.${grant.role}`), scope: label(grant) }),
            });
        }
        void reload();
    };

    const Heading = city ? 'h2' : 'h1';
    const sectionLevel = city ? 'h3' : 'h2';

    const personCell = (row: GrantRow) => (
        <TableCell>
            <div className="font-medium">{who(row)}</div>
            {row.user.name && <div className="text-xs text-muted-foreground">{row.user.email}</div>}
        </TableCell>
    );

    const roleCell = (row: GrantRow) => (
        <TableCell>
            <Badge variant="secondary" title={t(`roleHint.${row.role}`)}>{t(`role.${row.role}`)}</Badge>
        </TableCell>
    );

    const scopeCell = (row: GrantRow) => {
        const scope = namedScope(row);
        const Icon = SCOPE_ICON[scope.kind];
        const kind = t(`scopeKind.${scope.kind}`);
        return (
            <TableCell>
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                        <div className="truncate">{scope.name}</div>
                        <div className="text-xs text-muted-foreground">{scope.cityName && !city ? `${kind} · ${scope.cityName}` : kind}</div>
                    </div>
                </div>
            </TableCell>
        );
    };

    const whenCell = (when: Date | string, by: { name: string | null; email?: string } | null) => (
        <TableCell>
            <div className="whitespace-nowrap">{date(when)}</div>
            {by && <div className="text-xs text-muted-foreground">{t('by', { name: by.name ?? by.email ?? '—' })}</div>}
        </TableCell>
    );

    return (
        <div className={cn("flex flex-col gap-8", !city && "p-6")}>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                    {/* The global stylesheet centers every h2 and resets its weight. */}
                    <Heading className="!text-left text-2xl !font-bold tracking-tight">{t("title")}</Heading>
                    <p className="mt-1 text-sm text-muted-foreground">{city ? t("leadCity", { city: city.name }) : t("lead")}</p>
                </div>
                <Button onClick={() => setInviteOpen(true)}>
                    <MailPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("invite")}
                </Button>
            </header>

            {members.length === 0 && invitations.length === 0 && (
                <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                    <p className="text-sm font-medium">{t("empty")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
                </div>
            )}

            {members.length > 0 && (
                <Section level={sectionLevel} title={t("members")} count={members.length}>
                    <Table className="table-auto">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("columns.person")}</TableHead>
                                <TableHead>{t("columns.role")}</TableHead>
                                <TableHead>{t("columns.scope")}</TableHead>
                                <TableHead>{t("columns.since")}</TableHead>
                                <TableHead><span className="sr-only">{t("columns.actions")}</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((row) => (
                                <TableRow key={row.id}>
                                    {personCell(row)}
                                    {roleCell(row)}
                                    {scopeCell(row)}
                                    {whenCell(row.acceptedAt ?? row.createdAt, row.grantedBy)}
                                    <TableCell className="w-px whitespace-nowrap text-right">
                                        {revocable(row) && (
                                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setRevoking(row)}>
                                                {t("revoke.action")}
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Section>
            )}

            {invitations.length > 0 && (
                <Section level={sectionLevel} title={t("invitations")} count={invitations.length} hint={t("invitationsHint", { days: PENDING_GRANT_DAYS })}>
                    <Table className="table-auto">
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("columns.person")}</TableHead>
                                <TableHead>{t("columns.role")}</TableHead>
                                <TableHead>{t("columns.scope")}</TableHead>
                                <TableHead>{t("columns.invited")}</TableHead>
                                <TableHead>{t("columns.status")}</TableHead>
                                <TableHead><span className="sr-only">{t("columns.actions")}</span></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invitations.map((row) => (
                                <TableRow key={row.id}>
                                    {personCell(row)}
                                    {roleCell(row)}
                                    {scopeCell(row)}
                                    {whenCell(row.createdAt, row.grantedBy)}
                                    <TableCell className="whitespace-nowrap">
                                        {row.status === 'pending'
                                            ? <span className="text-xs text-muted-foreground">{t("expires", { date: expiry(row) })}</span>
                                            : <Badge variant="outline" className="border-destructive/40 text-destructive">{t("status.expired")}</Badge>}
                                    </TableCell>
                                    <TableCell className="w-px whitespace-nowrap text-right">
                                        {revocable(row) && (
                                            <div className="flex justify-end gap-0.5">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" disabled={resendingId !== null} onClick={() => resend(row)} aria-label={t("resend.action")} title={t("resend.action")}>
                                                    {resendingId === row.id
                                                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                        : <RotateCw className="h-4 w-4" aria-hidden="true" />}
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setRevoking(row)} aria-label={t("withdraw.action")} title={t("withdraw.action")}>
                                                    <X className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Section>
            )}

            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <Switch id="team-show-history" checked={showHistory} onCheckedChange={toggleHistory} />
                    <Label htmlFor="team-show-history">{t("showHistory")}</Label>
                </div>
                {showHistory && (history.length === 0
                    ? <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
                    : (
                        <Section level={sectionLevel} title={t("history")} count={history.length}>
                            <Table className="table-auto">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("columns.person")}</TableHead>
                                        <TableHead>{t("columns.role")}</TableHead>
                                        <TableHead>{t("columns.scope")}</TableHead>
                                        <TableHead>{t("columns.ended")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((row) => (
                                        <TableRow key={row.id} className="text-muted-foreground">
                                            {personCell(row)}
                                            {roleCell(row)}
                                            {scopeCell(row)}
                                            <TableCell className="whitespace-nowrap">
                                                <div>{row.acceptedAt ? t("status.revoked") : t("inviteWithdrawn")} · {date(row.revokedAt ?? row.createdAt)}</div>
                                                {row.revokedBy && <div className="text-xs">{t('by', { name: row.revokedBy.name ?? '—' })}</div>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Section>
                    ))}
            </div>

            <InviteDialog
                open={inviteOpen}
                onOpenChange={setInviteOpen}
                scopes={scopes}
                superadmin={superadmin}
                city={city}
                onInvited={invited}
            />

            <ConfirmDeleteDialog
                open={revoking !== null}
                onOpenChange={(open) => { if (!open) setRevoking(null); }}
                title={revoking?.status === 'active' ? t("revoke.title") : t("withdraw.title")}
                description={revoking?.status === 'active' ? t("revoke.description") : t("withdraw.description")}
                itemName={revoking ? describe(revoking) : ''}
                onConfirm={() => (revoking ? revoke(revoking) : Promise.resolve())}
            />
        </div>
    );
}

function Section({ level: Level, title, count, hint, children }: {
    level: 'h2' | 'h3';
    title: string;
    count: number;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div>
                <div className="flex items-baseline gap-2">
                    <Level className="!text-left !text-sm !font-semibold uppercase tracking-wide text-muted-foreground">{title}</Level>
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                </div>
                {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
            </div>
            <div className="overflow-x-auto rounded-xl border">{children}</div>
        </section>
    );
}
