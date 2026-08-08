import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <nav className="flex shrink-0 items-center gap-6 border-b px-6 py-3 text-sm">
        <span className="font-relative">Νότης · admin</span>
        <Link className="text-muted-foreground hover:text-foreground" href="/admin/playground">
          Playground
        </Link>
      </nav>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
