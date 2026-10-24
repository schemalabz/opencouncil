"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CopyButton } from "@/components/mcp/CopyButton"
import { toast } from "@/hooks/use-toast"
import { formatNumericDate } from "@/lib/formatters/time"
import { mintMachineToken, revokeMachineToken } from "@/lib/actions/machineAccounts"
import { mapAdministersToEntities } from "@/components/admin/users/administers"
import type { MachineAccountWithTokens } from "@/lib/db/types"

type Created = { id: string; rawToken: string }

/**
 * One machine account: its rights, and its tokens with mint and revoke. A
 * new token shows in place until the admin confirms the copy, so no stray
 * click hides the only copy of a live credential.
 */
export function MachineAccountSection({ account, mcpBaseUrl, onEdit }: {
    account: MachineAccountWithTokens
    mcpBaseUrl: string
    onEdit: (account: MachineAccountWithTokens) => void
}) {
    const t = useTranslations("admin.machineAccounts")
    const locale = useLocale()
    const router = useRouter()
    const [created, setCreated] = useState<Created | null>(null)
    const [confirming, setConfirming] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [refreshing, startRefresh] = useTransition()
    const pending = busy || refreshing
    const revealTitle = useRef<HTMLParagraphElement>(null)
    const section = useRef<HTMLElement>(null)
    const newTokenButton = useRef<HTMLButtonElement>(null)

    // A control that unmounts or disables takes the focus with it; hand it to
    // the control that now carries on, after the render that brings it back.
    const focusLater = (target: () => HTMLElement | null | undefined) =>
        requestAnimationFrame(() => target()?.focus())
    const revokeButtonOf = (tokenId: string) =>
        section.current?.querySelector<HTMLElement>(`[data-revoke="${tokenId}"]`)

    // The New token button disables itself while a token shows, so focus
    // moves to the token it just created.
    useEffect(() => {
        if (created) revealTitle.current?.focus()
    }, [created])

    const date = (value: Date) => formatNumericDate(new Date(value), undefined, locale)
    const grants = mapAdministersToEntities(account.administers)
    const activeCount = account.mcpTokens.filter(token => !token.revokedAt).length

    // A rejected action (network, an expired session) has no message a client
    // may read in production, so the toast says only that the action failed.
    const run = async (action: () => Promise<void>) => {
        setBusy(true)
        try {
            await action()
        } catch {
            toast({ variant: "destructive", title: t("errors.failed") })
        } finally {
            setBusy(false)
            // Also after a failure: an action can commit and lose its answer.
            startRefresh(() => router.refresh())
        }
    }

    const mint = () => run(async () => {
        setConfirming(null)
        const result = await mintMachineToken(account.id)
        setCreated({ id: result.id, rawToken: result.rawToken })
    })

    const revoke = (tokenId: string) => run(async () => {
        await revokeMachineToken(account.id, tokenId)
        setConfirming(null)
        // A revoked token is a dead credential: stop showing it.
        setCreated(previous => (previous?.id === tokenId ? null : previous))
        focusLater(() => newTokenButton.current)
    })

    return (
        <section ref={section} aria-labelledby={`machine-${account.id}`} className="border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id={`machine-${account.id}`} className="text-lg font-semibold">{account.name || account.email}</h2>
                        {account.isSuperAdmin && <Badge>{t("rights.superAdmin")}</Badge>}
                        {grants.map(grant => (
                            <Badge key={`${grant.type}-${grant.id}`} variant="outline">{t(`grantType.${grant.type}`)} · {grant.displayName}</Badge>
                        ))}
                        {!account.isSuperAdmin && grants.length === 0 && (
                            <Badge variant="outline" className="text-muted-foreground">{t("rights.none")}</Badge>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                        {t("createdOn", { date: date(account.createdAt) })}
                        {activeCount === 0 && <> · {t("noActiveToken")}</>}
                    </span>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(account)}>{t("editRights")}</Button>
                    <Button ref={newTokenButton} variant="outline" size="sm" disabled={pending || !!created} onClick={mint}>
                        {busy && !confirming ? t("creating") : t("newToken")}
                    </Button>
                </div>
            </div>

            {created && (
                <div role="region" aria-labelledby={`reveal-${account.id}`} className="m-4 flex flex-col gap-3 border-2 border-accent bg-accent/10 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p id={`reveal-${account.id}`} ref={revealTitle} tabIndex={-1} className="font-medium outline-none">{t("reveal.title")}</p>
                        <p className="text-xs text-muted-foreground">{t("reveal.keep")}</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium">{t("reveal.headerForm")}</p>
                        <div className="flex items-center gap-2 bg-muted p-3">
                            <code className="flex-1 break-all text-sm">{mcpBaseUrl}</code>
                            <CopyButton value={mcpBaseUrl} label={t("reveal.copyAddress")} />
                        </div>
                        <div className="flex items-center gap-2 bg-muted p-3">
                            <code className="flex-1 break-all text-sm">{created.rawToken}</code>
                            <CopyButton value={created.rawToken} label={t("reveal.copyToken")} />
                        </div>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-sm">{t("reveal.pathForm")}</summary>
                        <div className="mt-1.5 flex items-center gap-2 bg-muted p-3">
                            <code className="flex-1 break-all text-sm">{mcpBaseUrl}/{created.rawToken}</code>
                            <CopyButton value={`${mcpBaseUrl}/${created.rawToken}`} label={t("reveal.copyPathForm")} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{t("reveal.pathFormNote")}</p>
                    </details>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="flex items-start gap-2 text-sm text-amber-700">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            {t("reveal.warning")}
                        </p>
                        <Button size="sm" onClick={() => { setCreated(null); focusLater(() => newTokenButton.current) }}>{t("reveal.dismiss")}</Button>
                    </div>
                </div>
            )}

            {account.mcpTokens.length > 0 && (
                // Auto layout with a floor: on a phone the table scrolls
                // sideways in its own box instead of squeezing a column into the next.
                <Table className="table-auto min-w-[36rem]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("columns.token")}</TableHead>
                            <TableHead>{t("columns.created")}</TableHead>
                            <TableHead>{t("columns.lastUsed")}</TableHead>
                            <TableHead>{t("columns.status")}</TableHead>
                            <TableHead><span className="sr-only">{t("columns.actions")}</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {account.mcpTokens.map(token => (
                            <TableRow key={token.id} className={token.revokedAt ? "opacity-70" : created?.id === token.id ? "bg-accent/10" : undefined}>
                                <TableCell>
                                    <code className="whitespace-nowrap bg-muted px-2 py-1 text-sm">{token.keyPrefix}…</code>
                                    {created?.id === token.id && <Badge variant="outline" className="ml-2">{t("new")}</Badge>}
                                </TableCell>
                                <TableCell>{date(token.createdAt)}</TableCell>
                                <TableCell>{token.lastUsedAt ? date(token.lastUsedAt) : <span className="text-muted-foreground">{t("never")}</span>}</TableCell>
                                <TableCell>
                                    {token.revokedAt
                                        ? <Badge variant="secondary">{t("revokedOn", { date: date(token.revokedAt) })}</Badge>
                                        : <Badge variant="outline">{t("active")}</Badge>}
                                </TableCell>
                                <TableCell className="text-right">
                                    {!token.revokedAt && (confirming === token.id ? (
                                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                                            <span className="text-sm text-muted-foreground">{t("revokeQuestion")}</span>
                                            <Button variant="destructive" size="sm" disabled={pending} autoFocus onClick={() => revoke(token.id)}>
                                                {busy ? t("revoking") : t("revokeConfirm")}
                                            </Button>
                                            <Button variant="outline" size="sm" disabled={pending} onClick={() => { setConfirming(null); focusLater(() => revokeButtonOf(token.id)) }}>{t("cancel")}</Button>
                                        </span>
                                    ) : (
                                        <Button variant="outline" size="sm" className="text-destructive" disabled={pending} data-revoke={token.id} aria-label={t("revokeToken", { prefix: token.keyPrefix })} onClick={() => setConfirming(token.id)}>
                                            {t("revoke")}
                                        </Button>
                                    ))}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </section>
    )
}
