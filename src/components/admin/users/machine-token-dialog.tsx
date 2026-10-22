"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CopyButton } from "@/components/mcp/CopyButton"
import { toast } from "@/hooks/use-toast"
import { formatNumericDate } from "@/lib/formatters/time"
import { listMachineTokens, mintMachineToken, revokeMachineToken } from "@/lib/actions/machineAccounts"

type TokenRow = Awaited<ReturnType<typeof listMachineTokens>>[number]
type Account = { id: string; name: string | null; email: string }
type Created = { id: string; rawToken: string }

/**
 * The MCP tokens of one machine account (#590). The one-time credential
 * renders in the dialog, header form first: a token in a URL path lands in
 * proxy and access logs, a bearer header does not.
 */
export function MachineTokenDialog({ account, mcpBaseUrl, onOpenChange }: {
    account: Account | null
    mcpBaseUrl: string
    onOpenChange: (open: boolean) => void
}) {
    const t = useTranslations("admin.machineTokens")
    const [tokens, setTokens] = useState<TokenRow[] | null>(null)
    const [created, setCreated] = useState<Created | null>(null)
    const [busy, setBusy] = useState(false)
    const [confirming, setConfirming] = useState<string | null>(null)

    // A rejected action (network, an expired session) has no message a client
    // may read in production, so the toast says only that the action failed.
    const failed = () => toast({ variant: "destructive", title: t("errors.failed") })

    // The raw token leaves the state as soon as the dialog closes.
    useEffect(() => {
        setCreated(null)
        setConfirming(null)
        if (!account) return
        let cancelled = false
        setTokens(null)
        listMachineTokens(account.id)
            .then(rows => { if (!cancelled) setTokens(rows) })
            .catch(() => { if (!cancelled) failed() })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [account?.id])

    const mint = async () => {
        if (!account) return
        setBusy(true)
        try {
            const result = await mintMachineToken(account.id)
            setCreated({ id: result.id, rawToken: result.rawToken })
            setTokens(result.tokens)
        } catch {
            failed()
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (tokenId: string) => {
        if (!account) return
        setBusy(true)
        try {
            setTokens(await revokeMachineToken(account.id, tokenId))
            // A revoked token is a dead credential: stop showing it.
            setCreated(previous => (previous?.id === tokenId ? null : previous))
            setConfirming(null)
        } catch {
            failed()
        } finally {
            setBusy(false)
        }
    }

    const active = tokens?.filter(token => !token.revokedAt) ?? []
    const revoked = tokens?.filter(token => token.revokedAt) ?? []

    return (
        // A close while a mint is pending would hide the token of a credential
        // that goes live a moment later, so the dialog stays until it settles.
        <Dialog open={!!account} onOpenChange={open => { if (!open && !busy) onOpenChange(false) }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t("title", { name: account?.name || account?.email || "" })}</DialogTitle>
                    <DialogDescription>{t("description")}</DialogDescription>
                </DialogHeader>

                {created && (
                    <div className="space-y-4 rounded-md border p-4">
                        <div>
                            <p className="font-medium">{t("createdTitle")}</p>
                            <p className="text-sm text-muted-foreground">{t("createdNote")}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("headerForm")}</Label>
                            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                                <code className="flex-1 break-all text-sm">{mcpBaseUrl}</code>
                                <CopyButton value={mcpBaseUrl} />
                            </div>
                            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                                <code className="flex-1 break-all text-sm">{created.rawToken}</code>
                                <CopyButton value={created.rawToken} />
                            </div>
                            <p className="text-xs text-muted-foreground">{t("headerNote")}</p>
                        </div>
                        <div className="space-y-2">
                            <Label>{t("pathForm")}</Label>
                            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                                <code className="flex-1 break-all text-sm">{mcpBaseUrl}/{created.rawToken}</code>
                                <CopyButton value={`${mcpBaseUrl}/${created.rawToken}`} />
                            </div>
                            <p className="text-xs text-muted-foreground">{t("pathFormNote")}</p>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-amber-600">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{t("warning")}</span>
                        </div>
                    </div>
                )}

                {tokens === null ? (
                    <p className="text-sm text-muted-foreground">{t("loading")}</p>
                ) : tokens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("empty")}</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("columns.token")}</TableHead>
                                <TableHead>{t("columns.created")}</TableHead>
                                <TableHead>{t("columns.lastUsed")}</TableHead>
                                <TableHead>{t("columns.status")}</TableHead>
                                <TableHead>{t("columns.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...active, ...revoked].map(token => (
                                <TableRow key={token.id} className={token.revokedAt ? "opacity-70" : undefined}>
                                    <TableCell><code className="whitespace-nowrap rounded bg-muted px-2 py-1 text-sm">{token.keyPrefix}…</code></TableCell>
                                    <TableCell>{formatNumericDate(new Date(token.createdAt))}</TableCell>
                                    <TableCell>
                                        {token.lastUsedAt
                                            ? formatNumericDate(new Date(token.lastUsedAt))
                                            : <span className="text-muted-foreground">{t("never")}</span>}
                                    </TableCell>
                                    <TableCell>
                                        {token.revokedAt
                                            ? <Badge variant="secondary">{t("revokedOn", { date: formatNumericDate(new Date(token.revokedAt)) })}</Badge>
                                            : <Badge>{t("active")}</Badge>}
                                    </TableCell>
                                    <TableCell>
                                        {!token.revokedAt && (confirming === token.id ? (
                                            <div className="flex gap-2">
                                                <Button variant="destructive" size="sm" disabled={busy} onClick={() => revoke(token.id)}>
                                                    {busy ? t("revoking") : t("revokeConfirm")}
                                                </Button>
                                                <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                                                    {t("cancel")}
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(token.id)}>
                                                {t("revoke")}
                                            </Button>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <DialogFooter className="sm:justify-between">
                    <Button variant="outline" disabled={busy} onClick={mint}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        {busy ? t("creating") : t("create")}
                    </Button>
                    <Button disabled={busy} onClick={() => onOpenChange(false)}>{t("done")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
