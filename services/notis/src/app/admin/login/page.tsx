import { headers } from "next/headers";
import { Button } from "@opencouncil/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@opencouncil/ui/card";
import { env } from "@/env.mjs";
import { hasMainDb } from "@/lib/main-db";
import { getAdminSession } from "@/lib/session-auth";

// Auth happens on the main app: the browser signs in at opencouncil.gr, the
// shared cookie comes back scoped to the parent domain, and the panel layout
// validates it against notis_admin_sessions (superadmins only).
export default async function AdminLoginPage() {
  const session = await getAdminSession();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const callback = `${proto}://${host}/admin/playground`;
  const signInUrl = `${env.OPENCOUNCIL_BASE_URL}/sign-in?callbackUrl=${encodeURIComponent(callback)}`;

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-relative text-xl">Νότης · admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {session ? (
            <>
              <p className="text-sm text-muted-foreground">
                Συνδεδεμένος ως {session.userName ?? "superadmin"}.
              </p>
              <Button asChild className="w-full">
                <a href="/admin/playground">Συνέχεια</a>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Η σύνδεση γίνεται με τον λογαριασμό σου στο OpenCouncil. Πρόσβαση έχουν μόνο
                λογαριασμοί superadmin.
              </p>
              <Button asChild className="w-full">
                <a href={signInUrl}>Σύνδεση μέσω OpenCouncil</a>
              </Button>
              {!hasMainDb() && (
                <p className="text-sm text-destructive">
                  MAIN_DATABASE_URL is not set — cookie validation is unavailable on this
                  deployment.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
