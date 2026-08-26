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
        <Button asChild variant="ghost" size="icon" title={t("openButton")} className="h-9 w-9 lg:w-auto lg:px-3 gap-1.5 rounded-full text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
            <Link
                href={`/present/${cityId}/${meetingId}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Projector className="h-[18px] w-[18px] shrink-0" />
                <span className="hidden text-sm lg:inline">{t("openButton")}</span>
                <span className="sr-only">{t("openButton")}</span>
            </Link>
        </Button>
    );
}
