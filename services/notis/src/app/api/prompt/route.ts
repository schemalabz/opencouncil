import { NextResponse } from "next/server";
import { shippedPrompts } from "@/lib/deps";

/** The shipped prompts, for the playground's "reset to shipped" affordance. */
export function GET() {
  return NextResponse.json(shippedPrompts);
}
