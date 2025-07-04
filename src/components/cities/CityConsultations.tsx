import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, FileText, MapPin } from "lucide-react";
import { ClickableCard } from "@/components/ui/clickable-card";
import { formatConsultationEndDate } from "@/lib/utils/date";
import { isConsultationActive, ConsultationWithCity } from "@/lib/db/consultations";

interface CityConsultationsProps {
    consultations: ConsultationWithCity[];
    cityId: string;
    canEdit: boolean;
}

export default function CityConsultations({ consultations, cityId, canEdit }: CityConsultationsProps) {

    if (consultations.length === 0) {
        return (
            <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Δεν υπάρχουν διαβουλεύσεις</h3>
                <p className="text-muted-foreground">
                    Δεν υπάρχουν διαθέσιμες διαβουλεύσεις για αυτόν τον δήμο.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-6">
            {consultations.map((consultation) => {
                const isActive = isConsultationActive(consultation, consultation.city.timezone);

                return (
                    <ClickableCard
                        key={consultation.id}
                        href={`/${cityId}/consultation/${consultation.id}`}
                    >
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="text-xl mb-2">
                                        {consultation.name}
                                    </CardTitle>
                                    <CardDescription className="mb-4">
                                        Διαβούλευση για κανονισμό
                                    </CardDescription>
                                </div>
                                <Badge
                                    variant={isActive ? "default" : "secondary"}
                                    className="ml-4 shrink-0"
                                >
                                    {isActive ? "Ενεργή" : "Ανενεργή"}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <CalendarDays className="h-4 w-4" />
                                <span>
                                    {isActive ? "Λήγει:" : "Έληξε:"} {formatConsultationEndDate(consultation.endDate, consultation.city.timezone)}
                                </span>
                            </div>
                        </CardHeader>
                    </ClickableCard>
                );
            })}
        </div>
    );
} 