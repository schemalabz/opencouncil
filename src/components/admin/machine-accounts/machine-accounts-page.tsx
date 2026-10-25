"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserDialog } from "@/components/admin/users/user-dialog"
import { MachineAccountSection } from "@/components/admin/machine-accounts/machine-account-section"
import type { MachineAccountWithTokens } from "@/lib/db/types"

/**
 * The machine accounts (#590), kept apart from the people on /admin/users.
 * Create and edit use the user dialog in its machine mode: a machine account
 * is a user row with the same rights, a superadmin flag and grants.
 */
export function MachineAccountsPage({ accounts, mcpBaseUrl }: {
    accounts: MachineAccountWithTokens[]
    mcpBaseUrl: string
}) {
    const t = useTranslations("admin.machineAccounts")
    const router = useRouter()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<MachineAccountWithTokens | undefined>()

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <h1 className="text-2xl font-bold">{t("title")}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t("lead")}</p>
                </div>
                <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
                    <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("create")}
                </Button>
            </div>

            {accounts.length === 0
                ? <p className="text-sm text-muted-foreground">{t("empty")}</p>
                : accounts.map(account => (
                    <MachineAccountSection
                        key={account.id}
                        account={account}
                        mcpBaseUrl={mcpBaseUrl}
                        onEdit={(a) => { setEditing(a); setDialogOpen(true) }}
                    />
                ))}

            <UserDialog
                machine
                open={dialogOpen}
                user={editing}
                onOpenChange={(open) => {
                    setDialogOpen(open)
                    // Editing stays set while the dialog animates out, so it
                    // closes as the dialog it was; the create button clears it.
                    if (!open) router.refresh()
                }}
            />
        </div>
    )
}
