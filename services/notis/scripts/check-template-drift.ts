/**
 * Compare the template mirror in src/agent/templates.ts against what Bird
 * actually holds.
 *
 *   npm run check:templates
 *
 * Why this exists. Every variable a shell declares must be supplied or Bird
 * rejects the send with a 422, and a 422 is terminal — the row fails, the SMS
 * fallback covers it, and the reader gets the text without buttons. Nothing
 * else notices. That is how link_path shipped broken: the console changed,
 * the repository did not, and the first proactive update failed in production
 * days later.
 *
 * The mirror's own unit tests cannot catch this. They compare the file to
 * constants typed from the same reading, and to itself. Only Bird knows.
 *
 * Exits 1 on drift, 0 when the mirror is current, and 78 (EX_CONFIG) when it
 * cannot ask — a missing key must not read as "no drift".
 */
import { TEMPLATES, compareTemplateVariables, type TemplateName } from "@/agent/templates";
import { templateProjectId } from "@/lib/bird";
import { env } from "@/env.mjs";

interface ChannelTemplate {
  variables?: Array<{ key?: string }>;
}

async function birdVariables(projectId: string): Promise<string[]> {
  const url = `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/projects/${projectId}/channel-templates?limit=100`;
  const response = await fetch(url, {
    headers: { Authorization: `AccessKey ${env.BIRD_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`Bird returned ${response.status} for project ${projectId}: ${await response.text()}`);
  }
  const body = (await response.json()) as { results?: ChannelTemplate[] };
  // A project can hold several versions; a variable declared by any of them
  // can reach a send, so the union is the safe comparison.
  const keys = new Set<string>();
  for (const template of body.results ?? []) {
    for (const variable of template.variables ?? []) {
      if (variable.key) keys.add(variable.key);
    }
  }
  return [...keys];
}

async function main() {
  if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID) {
    console.error("BIRD_API_KEY and BIRD_WORKSPACE_ID are required to check for drift.");
    process.exit(78);
  }

  const drifted: string[] = [];
  const skipped: string[] = [];

  for (const name of Object.keys(TEMPLATES) as TemplateName[]) {
    const projectId = templateProjectId(name);
    if (!projectId) {
      // demos_checkin has no project id and no send path. Reported rather
      // than passed over, so "checked" never overstates itself.
      skipped.push(name);
      continue;
    }
    const drift = compareTemplateVariables(name, await birdVariables(projectId));
    if (!drift) {
      console.log(`  ok       ${name}`);
      continue;
    }
    drifted.push(name);
    console.error(`  DRIFT    ${name}`);
    if (drift.missing.length) {
      console.error(
        `           Bird declares ${drift.missing.join(", ")} and we never send it — every send of this shell fails with a 422.`,
      );
    }
    if (drift.unexpected.length) {
      console.error(`           we send ${drift.unexpected.join(", ")}, which Bird does not declare.`);
    }
  }

  if (skipped.length) console.log(`\nnot checked (no project id): ${skipped.join(", ")}`);

  if (drifted.length) {
    console.error(
      `\n${drifted.length} template(s) drifted. Update hasVariable/hasLinkPath in src/agent/templates.ts to match the Bird console.`,
    );
    process.exit(1);
  }
  console.log("\nthe mirror matches Bird.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(78);
});
