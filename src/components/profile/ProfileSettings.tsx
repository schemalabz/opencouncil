"use client";

import { Bell, ChevronRight, Clapperboard, MessageCircle, Settings2, UserRound, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { User } from "@prisma/client";
import { Link } from "@/i18n/routing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AccountSection } from "@/components/profile/AccountSection";
import { CommunicationPreferences } from "@/components/profile/CommunicationPreferences";
import { NotificationPreferencesSection } from "@/components/profile/NotificationPreferencesSection";
import { SectionHeading, SettingsBody, SettingsCard } from "@/components/profile/SettingsChrome";
import { UserInfoForm, type ConsentPerson } from "@/components/profile/UserInfoForm";

type TabKey = "personal" | "notifications" | "communication" | "account";

const TABS: Array<{ value: TabKey; icon: LucideIcon; label: string; lead: string }> = [
    { value: "personal", icon: UserRound, label: "tabPersonal", lead: "personalLead" },
    { value: "notifications", icon: Bell, label: "tabNotifications", lead: "notificationsLead" },
    { value: "communication", icon: MessageCircle, label: "tabCommunication", lead: "communicationLead" },
    { value: "account", icon: Settings2, label: "tabAccount", lead: "accountLead" },
];
const TAB_VALUES = TABS.map((tab) => tab.value);

// One row shape for the tabs and the links beside them, so the rail reads
// as one list. Active is the brand orange at a tint, the way the account
// menu marks what the viewer can edit.
const railRowClass =
    "flex w-full shrink-0 items-center gap-2.5 rounded-full border border-transparent px-3.5 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground hover:no-underline lg:rounded-xl lg:px-3 lg:py-2.5";

/**
 * The settings: a rail of tabs and, from `lg`, the links that belong next
 * to them, beside one tab's content. The tab lives in the URL (`?tab=`),
 * so the account menu and Νότης's "add it under personal details" land on
 * the right one. On a phone the rail is a strip that scrolls sideways, and
 * the links follow the content.
 */
/** The account fields the settings edit; the rest of the row stays on the server. */
export type ProfileAccount = Pick<
    User,
    "name" | "email" | "phone" | "updatedAt" | "allowProductUpdates" | "allowPetitionUpdates" | "allowFeedbackCalls"
>;

export function ProfileSettings({
    user,
    persons,
    highlightsAllowed,
    aside,
}: {
    user: ProfileAccount;
    persons: ConsentPerson[];
    highlightsAllowed: boolean;
    /** What this account administers, rendered by the server; absent when it administers nothing. */
    aside?: React.ReactNode;
}) {
    const t = useTranslations("Profile");
    const tAccount = useTranslations("account");
    const hasLinks = highlightsAllowed || aside !== undefined;

    return (
        <Tabs
            defaultValue="personal"
            searchParam="tab"
            values={TAB_VALUES}
            className="mt-7 lg:mt-9 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10"
        >
            <TabsList
                className="-mx-4 h-auto items-stretch gap-1 rounded-none bg-transparent px-4 py-0 pb-1 text-muted-foreground scrollbar-hide lg:mx-0 lg:flex-col lg:px-0 lg:pb-0"
            >
                {TABS.map(({ value, icon: Icon, label }) => (
                    <TabsTrigger
                        key={value}
                        value={value}
                        className={cn(
                            railRowClass,
                            "group w-auto justify-start data-[state=active]:border-[hsl(var(--orange))]/25 data-[state=active]:bg-[hsl(var(--orange))]/[0.08] data-[state=active]:text-foreground data-[state=active]:shadow-none lg:w-full",
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0 opacity-70 group-data-[state=active]:text-[hsl(var(--orange-deep))] group-data-[state=active]:opacity-100" aria-hidden />
                        {t(label)}
                    </TabsTrigger>
                ))}
            </TabsList>

            <div className="mt-5 min-w-0 lg:col-start-2 lg:row-span-2 lg:mt-0">
                {TABS.map(({ value, label, lead }) => (
                    <TabsContent key={value} value={value} className="mt-0">
                        <SectionHeading title={t(label)} lead={t(lead)} />
                        {value === "personal" && (
                            <SettingsCard>
                                <SettingsBody>
                                    <UserInfoForm user={user} isOnboarded persons={persons} />
                                </SettingsBody>
                            </SettingsCard>
                        )}
                        {value === "notifications" && <NotificationPreferencesSection />}
                        {value === "communication" && <CommunicationPreferences user={user} />}
                        {value === "account" && <AccountSection />}
                    </TabsContent>
                ))}
            </div>

            {hasLinks && (
                <div className="mt-8 flex flex-col gap-3 lg:col-start-1 lg:mt-3 lg:border-t lg:border-border lg:pt-3">
                    {highlightsAllowed && (
                        <Link href="/profile/highlights" className={cn(railRowClass, "group text-foreground")}>
                            <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{tAccount("myHighlights")}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                    )}
                    {aside}
                </div>
            )}
        </Tabs>
    );
}
