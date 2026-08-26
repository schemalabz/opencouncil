"use client";
import { Edit } from "lucide-react";
import { useTranscriptOptions } from "./options/OptionsContext";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useHighlight } from "./HighlightContext";
import { toast } from "@/hooks/use-toast";

export default function EditButton() {
    const { options, updateOptions } = useTranscriptOptions();
    const { editingHighlight } = useHighlight();
    const t = useTranslations('editing');

    // Only show if user has edit permissions
    if (!options.editsAllowed) {
        return null;
    }

    // Hide button if currently editing a highlight (exclusivity)
    if (editingHighlight) {
        return null;
    }

    // If already in edit mode, the button is hidden (EditingModeBar takes over)
    if (options.editable) {
        return null;
    }

    const handleEnableEdit = () => {
        updateOptions({ editable: true });
        toast({
            title: t('status.enabled'),
            description: t('status.enabledDescription'),
        });
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleEnableEdit}
            title={t('actions.enableEdit')}
            className="h-9 w-9 lg:w-auto lg:px-3 gap-1.5 rounded-full text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
            <Edit className="h-[18px] w-[18px] shrink-0" />
            <span className="hidden text-sm lg:inline">{t('actions.editShort')}</span>
            <span className="sr-only">{t('actions.enableEdit')}</span>
        </Button>
    );
}

