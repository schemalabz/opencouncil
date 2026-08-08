"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@opencouncil/ui/button";
import { Input } from "@opencouncil/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@opencouncil/ui/card";

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/admin/playground");
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "something went wrong");
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-relative text-xl">ο Νότης · admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || secret.length === 0}>
              {busy ? "..." : "Είσοδος"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
