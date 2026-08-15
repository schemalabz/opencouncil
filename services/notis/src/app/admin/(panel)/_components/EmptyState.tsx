import { LucideIcon } from "lucide-react";

/** Centered icon-plus-hint used by every empty pane in the admin panel. */
export function EmptyState({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center p-8">
      <div className="max-w-[320px] text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground/30" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
