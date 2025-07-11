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
import { useState, useEffect } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { City, Party, Person } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { UserWithRelations } from "@/lib/types"

interface UserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onDelete: (user: UserWithRelations) => void;
    user?: UserWithRelations
}

type EntityType = 'city' | 'party' | 'person'

interface EntityOption {
    id: string
    name: string
    displayName: string
    type: EntityType
    city?: {
        id: string
        name: string
    }
}

function mapAdministersToEntities(administers: NonNullable<UserDialogProps['user']>['administers']): EntityOption[] {
    if (!administers) return []

    const entities: EntityOption[] = []

    for (const a of administers) {
        if (a.city) {
            entities.push({
                id: a.city.id,
                name: a.city.name,
                displayName: a.city.name,
                type: 'city'
            })
        } else if (a.party?.city) {
            entities.push({
                id: a.party.id,
                name: a.party.name,
                displayName: `${a.party.city.name} / ${a.party.name}`,
                type: 'party',
                city: a.party.city
            })
        } else if (a.person?.city) {
            entities.push({
                id: a.person.id,
                name: a.person.name,
                displayName: `${a.person.city.name} / ${a.person.name}`,
                type: 'person',
                city: a.person.city
            })
        }
    }

    return entities
}

export function UserDialog({ open, onOpenChange, user, onDelete }: UserDialogProps) {
    const [loading, setLoading] = useState(false)
    const [entities, setEntities] = useState<EntityOption[]>([])
    const [selectedEntities, setSelectedEntities] = useState<EntityOption[]>([])
    const [comboboxOpen, setComboboxOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")
    const [loadingEntities, setLoadingEntities] = useState(false)
    const isEditing = !!user

    // Reset selected entities when user changes
    useEffect(() => {
        if (!user?.administers) return
        setSelectedEntities(mapAdministersToEntities(user.administers))
    }, [user])

    // Fetch entities when dialog opens
    useEffect(() => {
        if (open) {
            fetchEntities()
        } else {
            // Reset states when dialog closes
            setSearchValue("")
            setComboboxOpen(false)
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
        const data = {
            email: formData.get("email") as string,
            name: formData.get("name") as string,
            isSuperAdmin: formData.get("isSuperAdmin") === "on",
            administers: selectedEntities.map(entity => ({
                [entity.type]: { connect: { id: entity.id } }
            }))
        }

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
                throw new Error("Failed to save user")
            }

            onOpenChange(false)
        } catch (error) {
            console.error("Failed to save user:", error)
        } finally {
            setLoading(false)
        }
    }

    function addEntity(entityId: string) {
        const entity = entities.find(e => e.id === entityId)
        if (entity && !selectedEntities.some(e => e.id === entity.id)) {
            setSelectedEntities([...selectedEntities, entity])
            setSearchValue("")
            setComboboxOpen(false)
        }
    }

    function removeEntity(entityId: string) {
        setSelectedEntities(selectedEntities.filter(e => e.id !== entityId))
    }

    const filteredEntities = entities.filter(entity =>
        !selectedEntities.some(selected => selected.id === entity.id) &&
        (entity.displayName.toLowerCase().includes(searchValue.toLowerCase()) ||
            entity.type.toLowerCase().includes(searchValue.toLowerCase()))
    )

    const groupedEntities = {
        cities: filteredEntities.filter(e => e.type === 'city'),
        parties: filteredEntities.filter(e => e.type === 'party'),
        people: filteredEntities.filter(e => e.type === 'person')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Edit User" : "Create User"}</DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? "Edit user details and permissions."
                            : "Create a new user by entering their email. They will receive a magic link to sign in."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                defaultValue={user?.email}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                name="name"
                                defaultValue={user?.name || ""}
                            />
                        </div>
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
                            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={comboboxOpen}
                                        className="justify-between"
                                        disabled={loadingEntities}
                                    >
                                        {loadingEntities ? "Loading..." : "Add entity to administer..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0" align="start">
                                    <Command>
                                        <CommandInput
                                            placeholder="Search entities..."
                                            value={searchValue}
                                            onValueChange={setSearchValue}
                                        />
                                        <CommandList>
                                            <CommandEmpty>No entities found.</CommandEmpty>
                                            <CommandGroup>
                                                {groupedEntities.cities.map((entity) => (
                                                    <CommandItem
                                                        key={entity.id}
                                                        value={`${entity.displayName} city`}
                                                        onSelect={() => addEntity(entity.id)}
                                                    >
                                                        <div className="flex items-center">
                                                            <span>🏛️ {entity.displayName}</span>
                                                        </div>
                                                        <Check
                                                            className={cn(
                                                                "ml-auto h-4 w-4",
                                                                selectedEntities.some(e => e.id === entity.id) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                    </CommandItem>
                                                ))}
                                                {groupedEntities.parties.map((entity) => (
                                                    <CommandItem
                                                        key={entity.id}
                                                        value={`${entity.displayName} party`}
                                                        onSelect={() => addEntity(entity.id)}
                                                    >
                                                        <div className="flex items-center">
                                                            <span>👥 {entity.displayName}</span>
                                                        </div>
                                                        <Check
                                                            className={cn(
                                                                "ml-auto h-4 w-4",
                                                                selectedEntities.some(e => e.id === entity.id) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                    </CommandItem>
                                                ))}
                                                {groupedEntities.people.map((entity) => (
                                                    <CommandItem
                                                        key={entity.id}
                                                        value={`${entity.displayName} person`}
                                                        onSelect={() => addEntity(entity.id)}
                                                    >
                                                        <div className="flex items-center">
                                                            <span>👤 {entity.displayName}</span>
                                                        </div>
                                                        <Check
                                                            className={cn(
                                                                "ml-auto h-4 w-4",
                                                                selectedEntities.some(e => e.id === entity.id) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {selectedEntities.map(entity => (
                                    <Badge key={entity.id} variant="secondary">
                                        {entity.type === 'city' && '🏛️'}
                                        {entity.type === 'party' && '👥'}
                                        {entity.type === 'person' && '👤'}
                                        {' '}
                                        {entity.displayName}
                                        <button
                                            type="button"
                                            onClick={() => removeEntity(entity.id)}
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
                            {isEditing && (
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
                            <Button type="submit" disabled={loading}>
                                {loading ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
} 