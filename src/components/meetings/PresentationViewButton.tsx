import { Projector } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

interface PresentationViewButtonProps {
    cityId: string;
    meetingId: string;
}

export default function PresentationViewButton({
    cityId,
    meetingId,
}: PresentationViewButtonProps) {
    return (
        <Button asChild variant="ghost" size="icon" title="Παρουσίαση">
            <Link
                href={`/present/${cityId}/${meetingId}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Projector className="h-5 w-5" />
                <span className="sr-only">Παρουσίαση</span>
            </Link>
        </Button>
    );
}
