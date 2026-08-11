import { Projector } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

interface PresentationViewButtonProps {
    cityId: string;
    meetingId: string;
}

export default async function PresentationViewButton({
    cityId,
    meetingId,
}: PresentationViewButtonProps) {
    const t = await getTranslations("presentation");

    return (
        <Button asChild variant="ghost" size="icon" title={t("openButton")}>
            <Link
                href={`/present/${cityId}/${meetingId}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Projector className="h-5 w-5" />
                <span className="sr-only">{t("openButton")}</span>
            </Link>
        </Button>
    );
}
