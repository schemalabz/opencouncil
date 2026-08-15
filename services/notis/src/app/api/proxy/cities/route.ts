import { proxyOpencouncilGet } from "@/lib/api";

/** City list with logos from the main app's public REST API (CORS-avoiding). */
export async function GET() {
  return proxyOpencouncilGet("cities");
}
