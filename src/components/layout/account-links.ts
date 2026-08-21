import { Bell, Star, User, type LucideIcon } from "lucide-react";

/**
 * The account menu, shared by every surface that offers one: the header
 * dropdown, the landing rail and the mobile drawer. One list and one message
 * namespace, so a new entry does not need an edit and a translation in each
 * of them.
 */
export interface AccountLink {
    href: string;
    /** Key in the `account` message namespace. */
    labelKey: string;
    icon: LucideIcon;
}

export const ACCOUNT_LINKS: AccountLink[] = [
    { href: "/profile", labelKey: "profile", icon: User },
    { href: "/profile/highlights", labelKey: "myHighlights", icon: Star },
    { href: "/profile?tab=notifications", labelKey: "notifications", icon: Bell },
];
