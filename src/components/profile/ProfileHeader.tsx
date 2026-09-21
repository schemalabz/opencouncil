import { User as UserIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/formatters/time";
import { getInitials } from "@/lib/formatters/name";

/**
 * Who this page is about: the account as a disc of initials, the name as
 * the page's title, the email under it. The same disc the header's account
 * control shows, at the size of a page.
 */
export async function ProfileHeader({ name, email, createdAt }: { name: string | null; email: string; createdAt: Date }) {
    const [t, locale] = await Promise.all([getTranslations("Profile"), getLocale()]);
    return (
        <header className="flex items-center gap-4 pt-7 sm:gap-5 lg:pt-10">
            <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-[20px] font-semibold text-background sm:h-16 sm:w-16 sm:text-[22px]"
                aria-hidden
            >
                {name ? getInitials(name) : <UserIcon className="h-7 w-7" strokeWidth={1.75} />}
            </span>
            <div className="min-w-0">
                <h1 className="break-words text-[26px] font-normal leading-[1.05] tracking-[-0.02em] sm:text-[30px] lg:text-[36px]">
                    {name || t("title")}
                </h1>
                <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px] leading-snug text-muted-foreground">
                    <span className="truncate">{email}</span>
                    <span className="hidden sm:inline" aria-hidden>·</span>
                    <span className="text-[13px]">{t("memberSince", { date: formatDate(createdAt, undefined, locale) })}</span>
                </p>
            </div>
        </header>
    );
}
