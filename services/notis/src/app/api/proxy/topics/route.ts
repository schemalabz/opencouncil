import { proxyOpencouncilGet } from "@/lib/api";
import { requireAdmin } from "@/lib/session-auth";

/** Live topic taxonomy from the main app (Greek labels, matching MCP filters). */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return proxyOpencouncilGet("topics");
}
