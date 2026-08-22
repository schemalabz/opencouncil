"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  LayoutTemplate,
  MessagesSquare,
  Settings,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Επισκόπηση", icon: LayoutDashboard, exact: true },
  { href: "/admin/conversations", label: "Συνομιλίες", icon: MessagesSquare },
  { href: "/admin/wakes", label: "Wakes", icon: Activity },
  { href: "/admin/system", label: "Σύστημα", icon: Gauge },
  { href: "/admin/playground", label: "Playground", icon: FlaskConical },
  { href: "/admin/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/admin/settings", label: "Ρυθμίσεις", icon: Settings },
];

export function AdminSidebar({ live }: { live: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-muted/30">
      <Link href="/admin" className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-6 w-6 object-contain" />
        <span className="font-relative text-lg leading-none">Νότης</span>
      </Link>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-orange" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-[11px] leading-relaxed text-muted-foreground">
        {!live && <p>Χωρίς βάση δεδομένων · μηδενικά</p>}
        <a
          href="https://opencouncil.gr"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          opencouncil.gr ↗
        </a>
      </div>
    </aside>
  );
}
