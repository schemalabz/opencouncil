/**
 * One-time backfill of Diavgeia decisions for historical meetings across all
 * municipalities (issue #461).
 *
 * DRY-RUN BY DEFAULT. Nothing is dispatched unless `--execute` is passed, and
 * `--execute` refuses to run against a production-looking database unless
 * `--i-know-its-not-prod` is also passed.
 *
 * Usage:
 *   tsx scripts/backfill-decisions.ts                 # dry run, all cities
 *   tsx scripts/backfill-decisions.ts --city athens   # dry run, one city
 *   tsx scripts/backfill-decisions.ts --execute --i-know-its-not-prod
 *
 * Flags:
 *   --execute              Actually dispatch polls (default: false = dry run)
 *   --i-know-its-not-prod  Required acknowledgement to --execute past the prod guard
 *   --city <id>            Limit to a single city
 *   --batch-size <n>       Meetings dispatched per batch (default 10)
 *   --batch-delay-ms <ms>  Pause between batches (default 2000)
 *   --skip-recent-days <n> Skip meetings polled within N days (default 7)
 *   --limit <n>            Cap candidate meetings considered (trial runs)
 */
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runBackfill } from "@/lib/tasks/backfillDecisions";

/** Heuristic: does the configured DATABASE_URL look like production? */
function looksLikeProd(): boolean {
    if (process.env.NODE_ENV === "production") return true;
    const url = process.env.DATABASE_URL ?? "";
    return /prod|amazonaws|supabase|neon\.tech|render\.com|\.rds\./i.test(url);
}

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option("execute", {
            type: "boolean",
            default: false,
            describe: "Actually dispatch polls (default: dry run)",
        })
        .option("i-know-its-not-prod", {
            type: "boolean",
            default: false,
            describe: "Acknowledge the target DB is not production (required with --execute on prod-looking DBs)",
        })
        .option("city", { type: "string", describe: "Limit to a single city id" })
        .option("batch-size", { type: "number", default: 10 })
        .option("batch-delay-ms", { type: "number", default: 2000 })
        .option("skip-recent-days", { type: "number", default: 7 })
        .option("limit", { type: "number", describe: "Cap candidate meetings considered" })
        .check((a) => {
            if (a["batch-size"] < 1) throw new Error("--batch-size must be >= 1");
            if (a["batch-delay-ms"] < 0) throw new Error("--batch-delay-ms must be >= 0");
            if (a["skip-recent-days"] < 0) throw new Error("--skip-recent-days must be >= 0");
            if (a.limit !== undefined && a.limit < 1) throw new Error("--limit must be >= 1");
            return true;
        })
        .strict()
        .help().argv;

    if (argv.execute && looksLikeProd() && !argv["i-know-its-not-prod"]) {
        console.error(
            "Refusing to --execute: the target database looks like production " +
            "(NODE_ENV/DATABASE_URL). If you are certain it is NOT prod, re-run " +
            "with --i-know-its-not-prod.",
        );
        process.exit(1);
    }

    const result = await runBackfill({
        execute: argv.execute,
        cityId: argv.city,
        batchSize: argv["batch-size"],
        batchDelayMs: argv["batch-delay-ms"],
        skipRecentDays: argv["skip-recent-days"],
        limit: argv.limit,
    });

    if (!result.executed && result.toDispatch === 0) {
        console.log("\nNothing to dispatch.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Backfill failed:", error);
        process.exit(1);
    });
