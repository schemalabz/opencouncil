import { ChevronRight, ShieldCheck, type LucideIcon } from "lucide-react";
import type { GrantRole, Realm } from "@prisma/client";
// The locale-aware Link: next/link would drop the locale prefix.
import { Link } from "@/i18n/routing";
import { RailCard } from "@/components/ui/rail-card";
import { SCOPE_ICON } from "@/components/admin/team/scope";
import { namedScope, scopeLabel } from "@/lib/auth/grantScope";
import { activeGrants } from "@/lib/auth/rights";
import type { AdminEntityType } from "@/lib/db/adminEntities";

type AdminSectionProps = {
    user: {
        isSuperAdmin: boolean;
        administers: Array<{
            id: string;
            role: GrantRole;
            createdAt: Date;
            acceptedAt: Date | null;
            revokedAt: Date | null;
            realm?: Realm | null;
            city?: { id: string; name: string } | null;
            party?: { id: string; cityId: string; name: string; city?: { name: string } } | null;
            person?: { id: string; cityId: string; name: string; city?: { name: string } } | null;
            administrativeBody?: { id: string; cityId: string; name: string; city?: { name: string } } | null;
        }>;
    };
    /** @translationNamespace Profile */
    t: (key: string, params?: Record<string, string>) => string;
    /** The name of a role, from the `team` namespace. */
    roleLabel: (role: GrantRole) => string;
    /** The name of a kind of scope, from the `team` namespace. */
    kindLabel: (kind: AdminEntityType) => string;
};

interface AdminEntry {
    key: string;
    href: string;
    icon: LucideIcon;
    /** What the row is: the kind of scope and the role held there. */
    label: string;
    name: string;
}

/**
 * What this account can edit, as a rail card of links: the admin panel for
 * a superadmin, and one row per scope it holds a role on. The name says
 * which, with the city for a body, a party or a person, since many cities
 * have a body of the same name. The line under it says the kind and the
 * role, and the whole row is the link. A pending invite is no right yet, so
 * it has no row.
 */
export function AdminSection({ user, t, roleLabel, kindLabel }: AdminSectionProps) {
    const entries: AdminEntry[] = [];
    if (user.isSuperAdmin) {
        entries.push({ key: "superadmin", href: "/admin", icon: ShieldCheck, label: t("superAdminAccess"), name: t("goToAdmin") });
    }
    for (const grant of activeGrants(user.administers)) {
        const scope = namedScope({
            realm: grant.realm ?? null,
            city: grant.city ?? null,
            administrativeBody: grant.administrativeBody ?? null,
            party: grant.party ?? null,
            person: grant.person ?? null,
        });
        entries.push({
            key: grant.id,
            href: scope.path,
            icon: SCOPE_ICON[scope.kind],
            label: `${kindLabel(scope.kind)} · ${roleLabel(grant.role)}`,
            name: scopeLabel(scope),
        });
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
                                <span className="block truncate text-[13.5px] font-medium leading-snug text-foreground">{name}</span>
                                <span className="block text-[11px] leading-tight text-muted-foreground">{label}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
        </RailCard>
    );
}
