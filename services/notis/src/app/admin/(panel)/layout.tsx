import { AdminSidebar } from "./_components/AdminSidebar";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <AdminSidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
