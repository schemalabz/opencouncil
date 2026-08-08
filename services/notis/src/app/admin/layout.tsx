import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-6 border-b px-6 py-3 text-sm">
        <span className="font-relative">ο Νότης · admin</span>
        <Link className="text-muted-foreground hover:text-foreground" href="/admin/playground">
          Playground
        </Link>
      </nav>
      {children}
    </div>
  );
}
