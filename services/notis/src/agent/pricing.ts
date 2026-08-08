import { Usage } from "./types";

/**
 * claude-sonnet-5 pricing, USD per million tokens (list price — an intro rate
 * of $2/$10 applies through 2026-08-31, so real spend runs lower until then).
 * Cache writes bill at 1.25x input, cache reads at 0.1x.
 */
export const SONNET_5_RATES = {
  inputPerMTok: 3,
  outputPerMTok: 15,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok: 0.3,
};

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

export function usageToCost(usage: Usage): number {
  const m = 1_000_000;
  return (
    (usage.input / m) * SONNET_5_RATES.inputPerMTok +
    (usage.output / m) * SONNET_5_RATES.outputPerMTok +
    (usage.cacheWrite / m) * SONNET_5_RATES.cacheWritePerMTok +
    (usage.cacheRead / m) * SONNET_5_RATES.cacheReadPerMTok
  );
}
