import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, FileText, MapPin } from "lucide-react";
import { Consultation } from "@prisma/client";

interface CityConsultationsProps {
    consultations: Consultation[];
    cityId: string;
    canEdit: boolean;
}

export default function CityConsultations({ consultations, cityId, canEdit }: CityConsultationsProps) {

    if (consultations.length === 0) {
        return (
            <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Δεν υπάρχουν ενεργές διαβουλεύσεις</h3>
                <p className="text-muted-foreground">
                    Δεν υπάρχουν διαθέσιμες διαβουλεύσεις αυτή τη στιγμή.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-6">
            {consultations.map((consultation) => (
                <Link key={consultation.id} href={`/${cityId}/consultation/${consultation.id}`}>
                    <Card className="hover:shadow-md transition-all cursor-pointer hover:scale-[1.02]">
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="text-xl mb-2">
                                        {consultation.name}
                                    </CardTitle>
                                    <CardDescription className="mb-4">
                                        Διαβούλευση για κανονισμό - λήγει {consultation.endDate.toLocaleDateString("el-GR")}
                                    </CardDescription>
                                </div>
                                <Badge
                                    variant={consultation.isActive ? "default" : "secondary"}
                                    className="ml-4 shrink-0"
                                >
                                    {consultation.isActive ? "Ενεργή" : "Ανενεργή"}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <CalendarDays className="h-4 w-4" />
                                <span>
                                    Λήγει: {consultation.endDate.toLocaleDateString("el-GR")}
                                </span>
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
            ))}
        </div>
    );
} 