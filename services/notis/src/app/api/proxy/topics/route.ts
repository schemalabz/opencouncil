import { proxyOpencouncilGet } from "@/lib/api";

/** Live topic taxonomy from the main app (Greek labels, matching MCP filters). */
export async function GET() {
  return proxyOpencouncilGet("topics");
}
