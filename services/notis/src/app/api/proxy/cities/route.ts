import { proxyOpencouncilGet } from "@/lib/api";
import { requireAdmin } from "@/lib/session-auth";

/** City list with logos from the main app's public REST API (CORS-avoiding). */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return proxyOpencouncilGet("cities");
}
