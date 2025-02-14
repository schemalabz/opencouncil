import { getWaitlistEntries, deleteWaitlistEntry } from "@/lib/db/waitlist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import atticaData from "../../attica-hackathon/Περιφέρεια Αττικής.json";

export default async function WaitlistPage() {
    const waitlistEntries = await getWaitlistEntries();

    // Calculate municipality counts
    const municipalityCounts: { [key: string]: number } = {};
    waitlistEntries.forEach((entry: any) => {
        const municipalityIds = entry.municipalityIds.split(',');
        municipalityIds.forEach((id: string) => {
            const municipality = atticaData.find(m => m.code === id)?.name;
            if (municipality) {
                municipalityCounts[municipality] = (municipalityCounts[municipality] || 0) + 1;
            }
        });
    });

    const getMunicipalityNames = (municipalityIds: string) => {
        return municipalityIds.split(',')
            .map(id => atticaData.find(m => m.code === id)?.name)
            .filter(Boolean)
            .join(', ');
    };

    return (
        <div className="container mx-auto p-6">
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Waitlist Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold">Total Entries: {waitlistEntries.length}</p>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Municipality Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {Object.entries(municipalityCounts).map(([municipality, count]) => (
                                <div key={municipality} className="flex justify-between">
                                    <span>{municipality}</span>
                                    <span className="font-bold">{count}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                {waitlistEntries.map((entry: any) => (
                    <Card key={entry.id}>
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="font-medium">{entry.email}</p>
                                <p className="text-sm text-gray-500">
                                    {getMunicipalityNames(entry.municipalityIds)}
                                </p>
                                <p className="text-xs text-gray-400">
                                    Added: {new Date(entry.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <form action={async () => {
                                'use server'
                                await deleteWaitlistEntry(entry.id);
                            }}>
                                <Button
                                    type="submit"
                                    variant="destructive"
                                    size="icon"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

