import { TEMPLATES } from "@/agent/templates";
import { PageHeader } from "../_components/PageHeader";

export const metadata = { title: "Templates · Νότης admin" };

export default function TemplatesPage() {
  const templates = Object.values(TEMPLATES);

  return (
    <>
      <PageHeader title="Templates">
        <span className="text-xs text-muted-foreground">
          {templates.length} εγκεκριμένα στο Bird · πρέπει να μένουν λέξη-προς-λέξη συγχρονισμένα
        </span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          {templates.map((t) => (
            <div key={t.name} className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-medium">{t.name}</p>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                    t.category === "marketing"
                      ? "bg-orange/10 text-orange"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.category}
                </span>
              </div>
              <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
                <span className="whitespace-pre-wrap">{t.bodyPrefix}</span>
                {t.hasVariable && (
                  <span className="mx-0.5 rounded bg-orange/15 px-1 font-mono text-xs text-orange">
                    {"{{demos_text}}"}
                  </span>
                )}
                <span className="whitespace-pre-wrap">{t.bodySuffix}</span>
                <p className="mt-2 text-xs text-muted-foreground">{t.footer}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.buttons.map((b) => (
                  <span
                    key={b.label}
                    className="rounded-full border px-2.5 py-0.5 text-xs text-[#027eb5]"
                  >
                    {b.kind === "url" ? "↗ " : ""}
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
