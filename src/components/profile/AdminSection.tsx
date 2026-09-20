import { Building, ChevronRight, Flag, ShieldCheck, User, type LucideIcon } from "lucide-react";
// The locale-aware Link: next/link would drop the locale prefix.
import { Link } from "@/i18n/routing";
import { RailCard } from "@/components/ui/rail-card";

type AdminSectionProps = {
    user: {
        isSuperAdmin: boolean;
        administers: Array<{
            id: string;
            city?: { id: string; name: string } | null;
            party?: { id: string; cityId: string; name: string } | null;
            person?: { id: string; cityId: string; name: string } | null;
        }>;
    };
    /** @translationNamespace Profile */
    t: (key: string, params?: Record<string, string>) => string;
};

interface AdminEntry {
    key: string;
    href: string;
    icon: LucideIcon;
    label: string;
    name: string;
}

/**
 * What this account can edit, as a rail card of links: the admin panel for
 * a superadmin, and one row per city, party or person it administers. The
 * label says the kind, the name says which, and the whole row is the link.
 */
export function AdminSection({ user, t }: AdminSectionProps) {
    const entries: AdminEntry[] = [];
    if (user.isSuperAdmin) {
        entries.push({ key: "superadmin", href: "/admin", icon: ShieldCheck, label: t("superAdminAccess"), name: t("goToAdmin") });
    }
    for (const admin of user.administers) {
        if (admin.city) {
            entries.push({ key: admin.id, href: `/${admin.city.id}`, icon: Building, label: t("adminCity"), name: admin.city.name });
        } else if (admin.party) {
            entries.push({ key: admin.id, href: `/${admin.party.cityId}/parties/${admin.party.id}`, icon: Flag, label: t("adminParty"), name: admin.party.name });
        } else if (admin.person) {
            entries.push({ key: admin.id, href: `/${admin.person.cityId}/people/${admin.person.id}`, icon: User, label: t("adminPerson"), name: admin.person.name });
        }
    }
    if (entries.length === 0) return null;

    return (
        <RailCard title={t("administration")}>
            <ul className="-mx-2 -mb-1.5 flex flex-col">
                {entries.map(({ key, href, icon: Icon, label, name }) => (
                    <li key={key}>
                        <Link
                            href={href}
                            className="group flex items-center gap-3 rounded-xl px-2 py-2 no-underline transition-colors hover:bg-foreground/[0.04] hover:no-underline"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange))]/[0.10] text-[hsl(var(--orange-deep))]">
                                <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[11px] leading-tight text-muted-foreground">{label}</span>
                                <span className="block truncate text-[13.5px] font-medium leading-snug text-foreground">{name}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
        </RailCard>
    );
}
