"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PlusIcon, Copy, Check, AlertTriangle } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "@/hooks/use-toast"

interface ApiKey {
    id: string
    name: string
    keyPrefix: string
    createdAt: string
    lastUsedAt: string | null
    revokedAt: string | null
    createdBy: { name: string | null; email: string }
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([])
    const [loading, setLoading] = useState(true)
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")
    const [createdKey, setCreatedKey] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [copied, setCopied] = useState(false)
    const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null)
    const [revoking, setRevoking] = useState(false)

    async function refreshKeys() {
        try {
            const response = await fetch("/api/admin/api-keys")
            if (!response.ok) throw new Error("Failed to fetch API keys")
            const data = await response.json()
            setKeys(data)
        } catch (error) {
            console.error("Failed to fetch API keys:", error)
            toast({ title: "Error", description: "Failed to fetch API keys", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { refreshKeys() }, [])

    async function handleCreate() {
        if (!newKeyName.trim()) return
        setCreating(true)
        try {
            const response = await fetch("/api/admin/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName.trim() }),
            })
            if (!response.ok) throw new Error("Failed to create API key")
            const data = await response.json()
            setCreatedKey(data.rawKey)
            refreshKeys()
        } catch (error) {
            console.error("Failed to create API key:", error)
            toast({ title: "Error", description: "Failed to create API key", variant: "destructive" })
            setCreateDialogOpen(false)
        } finally {
            setCreating(false)
        }
    }

    async function handleRevoke() {
        if (!keyToRevoke) return
        setRevoking(true)
        try {
            const response = await fetch(`/api/admin/api-keys/${keyToRevoke.id}`, { method: "DELETE" })
            if (!response.ok) throw new Error("Failed to revoke API key")
            toast({ title: "Success", description: `API key "${keyToRevoke.name}" has been revoked.` })
            refreshKeys()
        } catch (error) {
            console.error("Failed to revoke API key:", error)
            toast({ title: "Error", description: "Failed to revoke API key", variant: "destructive" })
        } finally {
            setRevoking(false)
            setKeyToRevoke(null)
        }
    }

    function handleCopy() {
        if (!createdKey) return
        navigator.clipboard.writeText(createdKey)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    function handleCloseCreateDialog() {
        setCreateDialogOpen(false)
        setCreatedKey(null)
        setNewKeyName("")
        setCopied(false)
    }

    const activeKeys = keys.filter(k => !k.revokedAt)
    const revokedKeys = keys.filter(k => k.revokedAt)

    if (loading) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-6">API Keys</h1>
                <Card><CardContent className="p-6">Loading...</CardContent></Card>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">API Keys</h1>
                <Button onClick={() => setCreateDialogOpen(true)}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create API Key
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active Keys</CardTitle>
                </CardHeader>
                <CardContent>
                    {activeKeys.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No active API keys. Create one to get started.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Last Used</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeKeys.map((key) => (
                                    <TableRow key={key.id}>
                                        <TableCell className="font-medium">{key.name}</TableCell>
                                        <TableCell>
                                            <code className="text-sm bg-muted px-2 py-1 rounded">{key.keyPrefix}...</code>
                                        </TableCell>
                                        <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            {key.lastUsedAt
                                                ? new Date(key.lastUsedAt).toLocaleDateString()
                                                : <span className="text-muted-foreground">Never</span>
                                            }
                                        </TableCell>
                                        <TableCell>{key.createdBy.name || key.createdBy.email}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setKeyToRevoke(key)}
                                            >
                                                Revoke
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {revokedKeys.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Revoked Keys</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Revoked</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {revokedKeys.map((key) => (
                                    <TableRow key={key.id} className="opacity-60">
                                        <TableCell className="font-medium">{key.name}</TableCell>
                                        <TableCell>
                                            <code className="text-sm bg-muted px-2 py-1 rounded">{key.keyPrefix}...</code>
                                        </TableCell>
                                        <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>{key.revokedAt ? new Date(key.revokedAt).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell><Badge variant="secondary">Revoked</Badge></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Create API Key Dialog */}
            <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) handleCloseCreateDialog() }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{createdKey ? "API Key Created" : "Create API Key"}</DialogTitle>
                        <DialogDescription>
                            {createdKey
                                ? "Copy this key now. You won't be able to see it again."
                                : "Give this key a descriptive name so you can identify it later."
                            }
                        </DialogDescription>
                    </DialogHeader>

                    {createdKey ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                                <code className="text-sm flex-1 break-all">{createdKey}</code>
                                <Button variant="ghost" size="sm" onClick={handleCopy}>
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-amber-600">
                                <AlertTriangle className="h-4 w-4" />
                                <span>This key will only be shown once. Store it securely.</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="keyName">Key Name</Label>
                                <Input
                                    id="keyName"
                                    placeholder="e.g. Sentinel"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        {createdKey ? (
                            <Button onClick={handleCloseCreateDialog}>Done</Button>
                        ) : (
                            <>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
                                    {creating ? "Creating..." : "Create Key"}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Revoke Confirmation Dialog */}
            <Dialog open={!!keyToRevoke} onOpenChange={() => setKeyToRevoke(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Revoke API Key</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to revoke the API key <span className="font-semibold">{keyToRevoke?.name}</span>?
                            Any service using this key will immediately lose access.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" disabled={revoking}>Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
                            {revoking ? "Revoking..." : "Yes, revoke key"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
