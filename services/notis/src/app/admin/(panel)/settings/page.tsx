import { getAdminSession } from "@/lib/session-auth";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "@/agent/types";
import { PageHeader } from "../_components/PageHeader";
import { KillSwitch } from "./KillSwitch";

export const metadata = { title: "Ρυθμίσεις · Νότης admin" };
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs">{value}</span>
    </div>
  );
}

function EnvBadge({ present }: { present: boolean }) {
  return present ? (
    <span className="rounded bg-green-600/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-green-700">
      ορισμένο
    </span>
  ) : (
    <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-destructive">
      λείπει
    </span>
  );
}

export default async function SettingsPage() {
  // Re-assert auth in the page body: the (panel) layout guard does not
  // re-run on an RSC soft-navigation, so a segment request can reach this
  // page without it (enforced by the admin-auth-guard test).
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const promptsDir = path.join(process.cwd(), "prompts");
  const systemStat = fs.statSync(path.join(promptsDir, "system.md"));
  const contextFiles = fs
    .readdirSync(path.join(promptsDir, "context-pack"))
    .filter((f) => f.endsWith(".md"));

  return (
    <>
      <PageHeader title="Ρυθμίσεις">
        <span className="self-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          μόνο ανάγνωση · PR 1
        </span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid max-w-3xl gap-4">
          <KillSwitch />

          <section className="rounded-lg border bg-background p-4">
            <p className="text-sm font-medium">Μοντέλο</p>
            <div className="mt-2">
              <Row label="model" value={DEFAULT_CONFIG.model} />
              <Row label="effort" value={DEFAULT_CONFIG.effort} />
              <Row label="max turns / wake" value={DEFAULT_CONFIG.maxTurns} />
              <Row label="MCP" value={DEFAULT_CONFIG.mcpUrl} />
            </div>
          </section>

          <section className="rounded-lg border bg-background p-4">
            <p className="text-sm font-medium">Prompts</p>
            <div className="mt-2">
              <Row
                label="system.md"
                value={`${(systemStat.size / 1024).toFixed(1)} KB · ${systemStat.mtime.toISOString().slice(0, 16)}`}
              />
              <Row label="context pack" value={`${contextFiles.length} αρχεία`} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Τα prompts εκδίδονται με το deploy — δοκίμασε αλλαγές στο Playground (Prompt
              override) πριν τις κάνεις commit.
            </p>
          </section>

          <section className="rounded-lg border bg-background p-4">
            <p className="text-sm font-medium">Περιβάλλον</p>
            <div className="mt-2">
              <Row
                label="ANTHROPIC_API_KEY"
                value={<EnvBadge present={Boolean(process.env.ANTHROPIC_API_KEY)} />}
              />
              <Row
                label="NOTIS_DATABASE_URL"
                value={<EnvBadge present={Boolean(process.env.NOTIS_DATABASE_URL)} />}
              />
              <Row
                label="MAIN_DATABASE_URL"
                value={<EnvBadge present={Boolean(process.env.MAIN_DATABASE_URL)} />}
              />
              <Row
                label="NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"
                value={<EnvBadge present={Boolean(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN)} />}
              />
            </div>
          </section>

          <section className="rounded-lg border bg-background p-4">
            <p className="text-sm font-medium">Έρχονται με τη βάση (PR 2+)</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Σύνδεση Bird / WhatsApp και αποστολές εκτός simulator</li>
              <li>Όρια κόστους και ρυθμοί αποστολής ανά χρήστη</li>
              <li>Διαχείριση χρηστών και μεταφορά από τις παλιές ειδοποιήσεις</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
