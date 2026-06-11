"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMemo } from "react"
import { UserWithRelations } from "@/lib/db/users"
import type { City } from "@prisma/client"
import { cn } from "@/lib/utils"

interface CityCounts {
    id: string
    name: string
    officialSupport: boolean
    petitions: number
    notifications: number
}

interface CityRankingTableProps {
    users: UserWithRelations[]
}

function RankedTable({ rows, rankedBy }: { rows: CityCounts[]; rankedBy: 'petitions' | 'notifications' }) {
    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground py-8 text-center">No cities yet.</p>
    }
    return (
        <div className="max-h-[300px] overflow-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Petitions</TableHead>
                        <TableHead className="text-right">Signups</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((city, index) => (
                        <TableRow key={city.id}>
                            <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                            <TableCell>{city.name}</TableCell>
                            <TableCell className={cn("text-right tabular-nums", rankedBy === 'petitions' && "font-medium")}>
                                {city.petitions}
                            </TableCell>
                            <TableCell className={cn("text-right tabular-nums", rankedBy === 'notifications' && "font-medium")}>
                                {city.notifications}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export function CityRankingTable({ users }: CityRankingTableProps) {
    // Counts are cumulative state (all petitions/signups per city), deliberately
    // not filtered by the page's registration date range.
    const cityCounts = useMemo(() => {
        const counts = new Map<string, CityCounts>()
        const increment = (city: City, field: 'petitions' | 'notifications') => {
            let entry = counts.get(city.id)
            if (!entry) {
                entry = {
                    id: city.id,
                    name: city.name,
                    officialSupport: city.officialSupport,
                    petitions: 0,
                    notifications: 0,
                }
                counts.set(city.id, entry)
            }
            entry[field]++
        }
        users.forEach(user => {
            user.petitions.forEach(petition => increment(petition.city, 'petitions'))
            user.notificationPreferences.forEach(pref => increment(pref.city, 'notifications'))
        })
        return Array.from(counts.values())
    }, [users])

    const expansionRows = useMemo(() =>
        cityCounts
            .filter(city => !city.officialSupport)
            .sort((a, b) => b.petitions - a.petitions || b.notifications - a.notifications),
        [cityCounts])

    const supportedRows = useMemo(() =>
        cityCounts
            .filter(city => city.officialSupport)
            .sort((a, b) => b.notifications - a.notifications || b.petitions - a.petitions),
        [cityCounts])

    return (
        <Card>
            <CardHeader>
                <CardTitle>Cities</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs local defaultValue="expansion">
                    <TabsList className="mb-2">
                        <TabsTrigger value="expansion">Expansion demand</TabsTrigger>
                        <TabsTrigger value="supported">Supported cities</TabsTrigger>
                    </TabsList>
                    <TabsContent value="expansion">
                        <p className="text-xs text-muted-foreground mb-2">
                            Cities not yet officially supported, ranked by petitions
                        </p>
                        <RankedTable rows={expansionRows} rankedBy="petitions" />
                    </TabsContent>
                    <TabsContent value="supported">
                        <p className="text-xs text-muted-foreground mb-2">
                            Officially supported cities, ranked by notification signups
                        </p>
                        <RankedTable rows={supportedRows} rankedBy="notifications" />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
