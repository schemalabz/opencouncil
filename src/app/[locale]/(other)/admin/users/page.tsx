"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PlusIcon } from "lucide-react"
import { useState, useEffect } from "react"
import { UserDialog } from "@/components/admin/users/user-dialog"
import { toast } from "@/hooks/use-toast"
import { UserStats } from "@/components/admin/users/user-stats"
import { AnalyticsDashboard } from "@/components/admin/users/analytics-dashboard"
import { SeedUsersDialog } from "@/components/admin/users/seed-users-dialog"
import { ExpandableUserRow } from "@/components/admin/users/expandable-user-row"
import { UserWithRelations } from "@/lib/types"

export default function UsersPage() {
    const [users, setUsers] = useState<UserWithRelations[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const [selectedUser, setSelectedUser] = useState<UserWithRelations | undefined>()
    const [loading, setLoading] = useState(true)
    const [resendingInvite, setResendingInvite] = useState<string | null>(null)
    const [dateRange, setDateRange] = useState("30")

    // Calculate enhanced stats
    const totalUsers = users.length
    const onboardedUsers = users.filter(user => user.onboarded).length
    const contactableUsers = users.filter(user => user.allowContact).length
    const usersWithNotifications = users.filter(user => user.notificationPreferences.length > 0).length
    const usersWithPetitions = users.filter(user => user.petitions.length > 0).length
    
    // Calculate new users this week and month
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    
    const newUsersThisWeek = users.filter(user => new Date(user.createdAt) >= weekAgo).length
    const newUsersThisMonth = users.filter(user => new Date(user.createdAt) >= monthAgo).length

    async function refreshUsers() {
        try {
            const response = await fetch("/api/admin/users")
            if (!response.ok) throw new Error("Failed to fetch users")
            const data = await response.json()
            setUsers(data)
        } catch (error) {
            console.error("Failed to fetch users:", error)
            toast({
                title: "Error",
                description: "Failed to fetch users",
                variant: "destructive",
            })
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

    function onEditUser(user: UserWithRelations) {
        setSelectedUser(user)
        setDialogOpen(true)
    }

    async function onResendInvite(userId: string) {
        setResendingInvite(userId)
        try {
            const response = await fetch(`/api/admin/users/${userId}/resend-invite`, {
                method: "POST",
            })

            if (!response.ok) throw new Error("Failed to resend invite")

            toast({
                title: "Success",
                description: "Invite resent successfully",
            })
        } catch (error) {
            console.error("Failed to resend invite:", error)
            toast({
                title: "Error",
                description: "Failed to resend invite",
                variant: "destructive",
            })
        } finally {
            setResendingInvite(null)
        }
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
        <div className="p-6 space-y-6">
            {/* Page Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">User Management</h1>
                <div className="flex gap-2">
                    <SeedUsersDialog onUsersCreated={refreshUsers} />
                    <Button onClick={onCreateUser}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create User
                    </Button>
                </div>
            </div>

            {/* Analytics Dashboard */}
            <AnalyticsDashboard
                users={users}
                dateRange={dateRange} 
                onDateRangeChange={setDateRange} 
            />

            {/* Enhanced User Stats */}
            <UserStats
                totalUsers={totalUsers}
                onboardedUsers={onboardedUsers}
                contactableUsers={contactableUsers}
                usersWithNotifications={usersWithNotifications}
                usersWithPetitions={usersWithPetitions}
                newUsersThisWeek={newUsersThisWeek}
                newUsersThisMonth={newUsersThisMonth}
            />

            {/* Enhanced Users Table with Expandable Rows */}
            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Activity</TableHead>
                                <TableHead>Registered</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <ExpandableUserRow
                                    key={user.id}
                                    user={user}
                                    onEdit={onEditUser}
                                    onResendInvite={onResendInvite}
                                    resendingInvite={resendingInvite}
                                />
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