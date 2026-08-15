import { ModelResponse, Usage } from "./types";

/**
 * claude-sonnet-5 pricing, USD per million tokens (list price — an intro rate
 * of $2/$10 applies through 2026-08-31, so real spend runs lower until then).
 * Cache reads bill at 0.1× input; cache-write rates depend on TTL (below).
 */
export const SONNET_5_RATES = {
  inputPerMTok: 3,
  outputPerMTok: 15,
  // Cache writes bill by TTL: 1h at 2× base input, 5m at 1.25×.
  cacheWrite1hPerMTok: 6,
  cacheWrite5mPerMTok: 3.75,
  cacheReadPerMTok: 0.3,
};

/** Normalize the wire usage shape, keeping the TTL split when the SDK reports it. */
export function normalizeUsage(u: ModelResponse["usage"]): Usage {
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    ...(write1h != null ? { cacheWrite1h: write1h } : {}),
    cacheRead: u.cache_read_input_tokens ?? 0,
  };
}

export function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
  const write1h = (a.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? 0);
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    ...(a.cacheWrite1h !== undefined || b.cacheWrite1h !== undefined
      ? { cacheWrite1h: write1h }
      : {}),
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

export function usageToCost(usage: Usage): number {
  const m = 1_000_000;
  // Only the system breakpoint uses the 1h TTL; the user-turn and moving
  // breakpoints write at the 5m rate. Without the split (older fixtures),
  // bill everything at the 1h rate — an overstatement, never an understatement.
  const write1h = usage.cacheWrite1h ?? usage.cacheWrite;
  const write5m = usage.cacheWrite - write1h;
  return (
    (usage.input / m) * SONNET_5_RATES.inputPerMTok +
    (usage.output / m) * SONNET_5_RATES.outputPerMTok +
    (write1h / m) * SONNET_5_RATES.cacheWrite1hPerMTok +
    (write5m / m) * SONNET_5_RATES.cacheWrite5mPerMTok +
    (usage.cacheRead / m) * SONNET_5_RATES.cacheReadPerMTok
  );
}
