"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusIcon } from "lucide-react"
import { User, Administers } from "@prisma/client"
import { useState, useEffect } from "react"
import { UserDialog } from "@/components/admin/users/user-dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { UserStats } from "@/components/admin/users/user-stats"

interface UserWithAdministers extends Omit<User, 'administers'> {
    administers: Array<{
        id: string;
        city?: { id: string; name: string } | null;
        party?: { id: string; name: string; city: { id: string; name: string } } | null;
        person?: { id: string; name: string; city: { id: string; name: string } } | null;
    }>;
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserWithAdministers[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<UserWithAdministers | undefined>()
    const [loading, setLoading] = useState(true)
    const [resendingInvite, setResendingInvite] = useState<string | null>(null)

    // Calculate stats
    const totalUsers = users.length
    const onboardedUsers = users.filter(user => user.onboarded).length
    const contactableUsers = users.filter(user => user.allowContact).length

    async function refreshUsers() {
        try {
            const response = await fetch("/api/admin/users")
            if (!response.ok) {
                throw new Error("Failed to fetch users")
            }
            const data = await response.json()
            setUsers(data)
        } catch (error) {
            console.error("Failed to fetch users:", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refreshUsers()
    }, [])

    function onCreateUser() {
        setSelectedUser(undefined)
        setDialogOpen(true)
    }

    function onEditUser(user: UserWithAdministers) {
        setSelectedUser(user)
        setDialogOpen(true)
    }

    async function onResendInvite(userId: string) {
        setResendingInvite(userId)
        try {
            const response = await fetch(`/api/admin/users/${userId}/resend-invite`, {
                method: "POST"
            })
            if (!response.ok) throw new Error("Failed to resend invite")
            toast({
                title: "Invite sent successfully",
                description: "The invite has been sent to the user's email address.",
            })
        } catch (error) {
            console.error("Failed to resend invite:", error)
            toast({
                title: "Failed to resend invite",
                description: "An error occurred while sending the invite.",
            })
        } finally {
            setResendingInvite(null)
        }
    }

    function renderAdministers(user: UserWithAdministers) {
        if (user.isSuperAdmin) {
            return <Badge variant="default">Super Admin</Badge>
        }

        return (
            <div className="flex flex-wrap gap-1">
                {user.administers.map((admin) => {
                    if (admin.city) {
                        return (
                            <Badge key={admin.id} variant="secondary">
                                🏛️ {admin.city.name}
                            </Badge>
                        )
                    }
                    if (admin.party) {
                        return (
                            <Badge key={admin.id} variant="secondary">
                                👥 {admin.party.name}
                            </Badge>
                        )
                    }
                    if (admin.person) {
                        return (
                            <Badge key={admin.id} variant="secondary">
                                👤 {admin.person.name}
                            </Badge>
                        )
                    }
                    return null
                })}
            </div>
        )
    }

    if (loading) {
        return (
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">User Management</h1>
                </div>
                <Card>
                    <CardContent className="p-6">
                        Loading...
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">User Management</h1>
                <Button onClick={onCreateUser}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create User
                </Button>
            </div>

            <UserStats
                totalUsers={totalUsers}
                onboardedUsers={onboardedUsers}
                contactableUsers={contactableUsers}
            />

            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Administers</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>{user.name || '-'}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        {user.onboarded ? 'Onboarded' : 'Not Onboarded'}
                                    </TableCell>
                                    <TableCell>
                                        {renderAdministers(user)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onEditUser(user)}
                                            >
                                                Edit
                                            </Button>
                                            {!user.onboarded && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => onResendInvite(user.id)}
                                                    disabled={resendingInvite === user.id}
                                                >
                                                    {resendingInvite === user.id ? 'Sending...' : 'Resend Invite'}
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <UserDialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (!open) {
                        refreshUsers()
                    }
                }}
                user={selectedUser}
            />
        </div>
    )
} 