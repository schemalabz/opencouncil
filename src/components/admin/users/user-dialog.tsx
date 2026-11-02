import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import type { GrantRole } from "@prisma/client"
import type { UserWithAdministers } from "@/lib/db/types"
import { machineAccountAddress, machineAccountSlug } from "@/lib/auth/machineAccounts"
import { GRANT_TYPE_ICON, grantKey, mapAdministersToGrants, type GrantEntry } from "@/components/admin/users/administers"
import { GRANT_ROLES } from "@/lib/auth/rights"
import type { AdminEntity } from "@/lib/db/adminEntities"
import Combobox from "@/components/Combobox"
import { toast } from "@/hooks/use-toast"
import { useValidationMessage } from "@/hooks/useLocalizedValidation"
import { apiErrorMessage } from "@/lib/utils/validationIssues"

interface UserDialogProps<U extends UserWithAdministers> {
    open: boolean
    onOpenChange: (open: boolean) => void
    onDelete?: (user: U) => void;
    user?: U
    /** Create a machine account (#590) instead of inviting a person. */
    machine?: boolean
}

export function UserDialog<U extends UserWithAdministers>({ open, onOpenChange, user, onDelete, machine = false }: UserDialogProps<U>) {
    const validationMessage = useValidationMessage()
    const [loading, setLoading] = useState(false)
    const [entities, setEntities] = useState<AdminEntity[]>([])
    const [selected, setSelected] = useState<GrantEntry[]>([])
    const [loadingEntities, setLoadingEntities] = useState(false)
    const [label, setLabel] = useState("")
    // A person's email is how they sign in: an edit keeps it locked until
    // the admin asks to change it.
    const [emailUnlocked, setEmailUnlocked] = useState(false)
    const emailInput = useRef<HTMLInputElement>(null)
    const isEditing = !!user
    const isMachine = user ? user.isMachine : machine
    // The address a new machine account gets, shown as the label is typed.
    const slug = machineAccountSlug(label)
    const noun = isMachine ? "machine account" : "user"

    // Every open starts from the account it edits, or from nothing: the
    // dialog stays mounted, so a create must not inherit the grants of the
    // last account edited.
    useEffect(() => {
        if (!open) return
        setLabel("")
        setEmailUnlocked(false)
        setSelected(user ? mapAdministersToGrants(user.administers) : [])
    }, [open, user])

    // The "Change email" link unmounts on click; the field it unlocks takes the focus.
    useEffect(() => {
        if (emailUnlocked) emailInput.current?.focus()
    }, [emailUnlocked])

    // Fetch entities when dialog opens
    useEffect(() => {
        if (open) {
            fetchEntities()
        }
    }, [open])

    async function fetchEntities() {
        setLoadingEntities(true)
        try {
            const response = await fetch('/api/admin/entities')
            if (!response.ok) throw new Error('Failed to fetch entities')
            const data = await response.json()
            if (!Array.isArray(data)) throw new Error('Invalid response format')
            setEntities(data)
        } catch (error) {
            console.error('Failed to fetch entities:', error)
            setEntities([])
        } finally {
            setLoadingEntities(false)
        }
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const email = String(formData.get("email") ?? "")
        const name = String(formData.get("name") ?? "")
        const rights = {
            isSuperAdmin: formData.get("isSuperAdmin") === "on",
            administers: selected.map(({ entity, role }) => ({
                role,
                realm: entity.type === 'realm' ? entity.id : null,
                cityId: entity.type === 'city' ? entity.id : null,
                partyId: entity.type === 'party' ? entity.id : null,
                personId: entity.type === 'person' ? entity.id : null,
                administrativeBodyId: entity.type === 'body' ? entity.id : null,
            }))
        }
        // A machine account's address is derived from its label and never
        // changes, so an edit sends no email; a create sends the label.
        const data = isMachine
            ? (isEditing ? { name: name || null, ...rights } : { isMachine: true, label, ...rights })
            : { ...(isEditing && !emailUnlocked ? {} : { email }), name: name || null, ...rights }

        try {
            const response = await fetch("/api/admin/users", {
                method: isEditing ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...data,
                    id: user?.id,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                throw new Error(apiErrorMessage(errorData, response.status, "Failed to save user", validationMessage))
            }

            const result = await response.json()

            if (result.warning) {
                toast({
                    title: "User created with warning",
                    description: result.warning,
                    variant: "destructive",
                })
            } else {
                toast({
                    title: "Success",
                    description: isEditing ? `The ${noun} was updated.` : `The ${noun} was created.`,
                })
            }

            onOpenChange(false)
        } catch (error) {
            console.error("Failed to save user:", error)
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to save user",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    // A new grant starts as admin, and the badge changes its role. An account
    // may hold two roles on one entity (the team page gives them), so a badge
    // offers only the roles the entity's other badges do not hold: two badges
    // with one key would be removed together.
    const sameEntity = (a: AdminEntity, b: AdminEntity) => a.type === b.type && a.id === b.id
    const isSelected = (entity: AdminEntity) => selected.some(grant => sameEntity(grant.entity, entity))
    const rolesHeld = (entity: AdminEntity) => selected.filter(grant => sameEntity(grant.entity, entity)).map(grant => grant.role)

    function addEntity(entity: AdminEntity) {
        if (isSelected(entity)) return
        setSelected([...selected, { key: grantKey(entity, 'admin'), role: 'admin', entity }])
    }

    function setRole(key: string, role: GrantRole) {
        const grant = selected.find(g => g.key === key)
        if (!grant || rolesHeld(grant.entity).includes(role)) return
        setSelected(selected.map(g => g.key === key ? { key: grantKey(g.entity, role), role, entity: g.entity } : g))
    }

    function removeGrant(key: string) {
        setSelected(selected.filter(grant => grant.key !== key))
    }

    const availableEntities = entities.filter(entity => !isSelected(entity))

    const groupedEntities = {
        realms: availableEntities.filter(e => e.type === 'realm'),
        cities: availableEntities.filter(e => e.type === 'city'),
        parties: availableEntities.filter(e => e.type === 'party'),
        people: availableEntities.filter(e => e.type === 'person'),
        bodies: availableEntities.filter(e => e.type === 'body')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isMachine
                            ? (isEditing ? "Edit machine account" : "New machine account")
                            : (isEditing ? "Edit User" : "Create User")}
                    </DialogTitle>
                    <DialogDescription>
                        {isMachine
                            ? (isEditing
                                ? "A machine account never signs in. Its MCP tokens act with the rights below."
                                : "For one service that connects to the MCP server. It never signs in. You mint its tokens after you create it.")
                            : (isEditing
                                ? "Edit user details and permissions."
                                : "Create a new user by entering their email. They will receive a magic link to sign in.")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit}>
                    <div className="grid gap-4 py-4">
                        {isMachine && !isEditing ? (
                            <div className="grid gap-2">
                                <Label htmlFor="label">Label</Label>
                                <Input
                                    id="label"
                                    name="label"
                                    placeholder="e.g. Paola"
                                    maxLength={100}
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                    required
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground">
                                    {slug
                                        ? <>Address: <code>{machineAccountAddress(slug)}</code></>
                                        : "The label needs a Latin letter or a digit; it becomes the address of the account."}
                                </p>
                            </div>
                        ) : isMachine ? (
                            <div className="grid gap-1">
                                <span className="text-sm font-medium">Address</span>
                                <code className="text-sm">{user?.email}</code>
                                <p className="text-xs text-muted-foreground">The address stays the same when the name changes.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    ref={emailInput}
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={user?.email}
                                    disabled={isEditing && !emailUnlocked}
                                    required
                                />
                                {isEditing && !emailUnlocked && (
                                    <button
                                        type="button"
                                        className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                        onClick={() => setEmailUnlocked(true)}
                                    >
                                        Change email
                                    </button>
                                )}
                            </div>
                        )}
                        {(!isMachine || isEditing) && (
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    defaultValue={user?.name || ""}
                                />
                            </div>
                        )}
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="isSuperAdmin"
                                name="isSuperAdmin"
                                defaultChecked={user?.isSuperAdmin}
                            />
                            <Label htmlFor="isSuperAdmin">Super Admin</Label>
                        </div>
                        <div className="grid gap-2">
                            <Label>Administers</Label>
                            <Combobox
                                items={availableEntities}
                                value={null}
                                onChange={(entity) => {
                                    if (entity) addEntity(entity as AdminEntity)
                                }}
                                placeholder={loadingEntities ? "Loading..." : "Add entity to administer..."}
                                searchPlaceholder="Search entities..."
                                getItemLabel={(entity) => (entity as AdminEntity).displayName}
                                getItemValue={(entity) => `${(entity as AdminEntity).displayName} ${(entity as AdminEntity).type}`}
                                groups={[
                                    { key: 'realms', label: 'Realms', items: groupedEntities.realms },
                                    { key: 'cities', label: 'Cities', items: groupedEntities.cities },
                                    { key: 'parties', label: 'Parties', items: groupedEntities.parties },
                                    { key: 'people', label: 'People', items: groupedEntities.people },
                                    { key: 'bodies', label: 'Administrative bodies', items: groupedEntities.bodies },
                                ]}
                                disabled={loadingEntities}
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                                {selected.map(({ key, role, entity }) => (
                                    <Badge key={key} variant="secondary" className="gap-1">
                                        {GRANT_TYPE_ICON[entity.type]} {entity.displayName}
                                        <select
                                            value={role}
                                            onChange={(e) => setRole(key, e.target.value as GrantRole)}
                                            aria-label={`Role on ${entity.displayName}`}
                                            className="rounded border-0 bg-transparent text-xs"
                                        >
                                            {GRANT_ROLES.map(option => (
                                                <option key={option} value={option} disabled={option !== role && rolesHeld(entity).includes(option)}>{option}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => removeGrant(key)}
                                            aria-label={`Remove ${entity.displayName}`}
                                            className="ml-1 hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-between">
                        <div>
                            {isEditing && !isMachine && onDelete && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => onDelete(user!)}
                                >
                                    Delete User
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={loading || (isMachine && !isEditing && !slug)}>
                                {loading ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
} 
