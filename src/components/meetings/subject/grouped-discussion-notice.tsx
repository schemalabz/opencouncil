"use client";
import { Subject, Topic } from "@prisma/client";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import SubjectBadge from "@/components/subject-badge";
import { Statistics } from "@/lib/statistics";

interface GroupedDiscussionNoticeProps {
    primarySubject: Subject & {
        topic?: Topic | null;
        statistics?: Statistics;
    };
}

export function GroupedDiscussionNotice({ primarySubject }: GroupedDiscussionNoticeProps) {
    const t = useTranslations("Subject");

    return (
        <CollapsibleCard
            icon={<Link2 className="w-4 h-4" />}
            title={t("groupedDiscussion")}
            defaultOpen={true}
        >
            <div className="p-4">
                <p className="text-sm text-muted-foreground mb-3">
                    {t("groupedDiscussionDescription")}
                </p>
                <SubjectBadge subject={primarySubject} />
            </div>
        </CollapsibleCard>
    );
}
