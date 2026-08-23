import { NextResponse } from "next/server";
import { shippedPrompts } from "@/lib/deps";
import { requireAdmin } from "@/lib/session-auth";

/** The shipped prompts, for the playground's "reset to shipped" affordance. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json(shippedPrompts);
}
