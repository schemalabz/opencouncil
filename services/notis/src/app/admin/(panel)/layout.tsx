import { redirect } from "next/navigation";
import { AdminSidebar } from "./_components/AdminSidebar";
import { getAdminSession } from "@/lib/session-auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // The edge proxy only checks that the session cookie exists; this is the
  // real gate — the token must belong to an unexpired superadmin session.
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex h-full">
      <AdminSidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
