"use client"

import { UserWithRelations } from "@/lib/db/users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TableCell } from "@/components/ui/table"
import { 
    Bell, 
    FileText, 
    CheckCircle, 
    XCircle, 
    Mail,
    Phone,
    Calendar,
    Users,
    MapPin,
    Tag
} from "lucide-react"
import { format } from "date-fns"
import { ExpandableTableRow } from "@/components/ui/expandable-table-row"

interface ExpandableUserRowProps {
    user: UserWithRelations
    onEdit: (user: UserWithRelations) => void
    onResendInvite: (userId: string) => void
    resendingInvite: string | null
}

export function ExpandableUserRow({ 
    user, 
    onEdit, 
    onResendInvite, 
    resendingInvite 
}: ExpandableUserRowProps) {
    const notificationCount = user.notificationPreferences.length
    const petitionCount = user.petitions.length
    const hasActivity = notificationCount > 0 || petitionCount > 0

    // Expanded content
    const expandedContent = (
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Administrative Roles Section */}
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    Administrative Roles
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-xs">
                                {user.administers.length > 0 ? (
                                    <div className="space-y-2">
                                        {user.administers.map((admin) => {
                                            if (admin.city) {
                                                return (
                                                    <Badge key={admin.id} variant="secondary" className="block w-fit">
                                                        🏛️ {admin.city.name}
                                                    </Badge>
                                                )
                                            }
                                            if (admin.party) {
                                                return (
                                                    <Badge key={admin.id} variant="secondary" className="block w-fit">
                                                        👥 {admin.party.city.name} / {admin.party.name}
                                                    </Badge>
                                                )
                                            }
                                            if (admin.person) {
                                                return (
                                                    <Badge key={admin.id} variant="secondary" className="block w-fit">
                                                        👤 {admin.person.city.name} / {admin.person.name}
                                                    </Badge>
                                                )
                                            }
                                            return null
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No administrative roles</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Notification Preferences Section */}
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Bell className="h-4 w-4" />
                                    Notification Preferences
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-xs">
                                {user.notificationPreferences.length > 0 ? (
                                    <div className="space-y-3">
                                        {user.notificationPreferences.map((pref) => (
                                            <div key={pref.id} className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-3 w-3" />
                                                    <span className="text-sm font-medium">{pref.city.name}</span>
                                                </div>
                                                {pref.interests.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 ml-5">
                                                        {pref.interests.map((interest) => (
                                                            <Badge key={interest.id} variant="outline" className="text-xs">
                                                                <Tag className="h-2 w-2 mr-1" />
                                                                {interest.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No notification preferences</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Petition Activity Section */}
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Petition Activity
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-xs">
                                {user.petitions.length > 0 ? (
                                    <div className="space-y-2">
                                        {user.petitions.map((petition) => (
                                            <div key={petition.id} className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-3 w-3" />
                                                    <span className="text-sm font-medium">{petition.city.name}</span>
                                                </div>
                                                <div className="flex gap-2 ml-5">
                                                    {petition.is_resident && (
                                                        <Badge variant="outline" className="text-xs">
                                                            Resident
                                                        </Badge>
                                                    )}
                                                    {petition.is_citizen && (
                                                        <Badge variant="outline" className="text-xs">
                                                            Citizen
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No petition submissions</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
    )

    return (
        <ExpandableTableRow
            rowId={user.id}
            expandedContent={expandedContent}
            ariaLabel={user.name || user.email}
        >
            {/* User Info */}
            <TableCell className="w-[300px]">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{user.name || 'Unnamed User'}</span>
                        {user.isSuperAdmin && (
                            <Badge variant="default" className="text-xs flex-shrink-0">
                                Super Admin
                            </Badge>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                </div>
            </TableCell>

            {/* Status */}
            <TableCell className="w-24">
                <div className="flex items-center gap-2">
                    {user.onboarded ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm whitespace-nowrap">
                        {user.onboarded ? 'Onboarded' : 'Pending'}
                    </span>
                </div>
            </TableCell>

            {/* Contact */}
            <TableCell className="w-20">
                <div className="flex items-center gap-2">
                    <Mail className={`h-4 w-4 ${user.allowContact ? 'text-blue-600' : 'text-gray-300'}`} />
                    <Phone className={`h-4 w-4 ${user.allowContact && user.phone ? 'text-green-600' : 'text-gray-300'}`} />
                </div>
            </TableCell>

            {/* Activity Summary */}
            <TableCell className="w-24">
                {hasActivity ? (
                    <div className="flex items-center gap-3">
                        {notificationCount > 0 && (
                            <div className="flex items-center gap-1">
                                <Bell className="h-3 w-3 text-blue-600" />
                                <span className="text-sm font-medium">{notificationCount}</span>
                            </div>
                        )}
                        {petitionCount > 0 && (
                            <div className="flex items-center gap-1">
                                <FileText className="h-3 w-3 text-green-600" />
                                <span className="text-sm font-medium">{petitionCount}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">No activity</span>
                )}
            </TableCell>

            {/* Registration Date */}
            <TableCell className="w-28">
                <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm whitespace-nowrap">
                        {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                    </span>
                </div>
            </TableCell>

            {/* Actions */}
            <TableCell className="w-32">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation()
                            onEdit(user)
                        }}
                    >
                        Edit
                    </Button>
                    {!user.onboarded && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation()
                                onResendInvite(user.id)
                            }}
                            disabled={resendingInvite === user.id}
                        >
                            {resendingInvite === user.id ? 'Sending...' : 'Resend Invite'}
                        </Button>
                    )}
                </div>
            </TableCell>
        </ExpandableTableRow>
    )
} 