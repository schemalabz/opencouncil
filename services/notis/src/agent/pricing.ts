import { ModelResponse, Usage } from "./types";

interface Rates {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Cache writes bill by TTL: 1h at 2× base input, 5m at 1.25×. */
  cacheWrite1hPerMTok: number;
  cacheWrite5mPerMTok: number;
  /** Cache reads bill at 0.1× input. */
  cacheReadPerMTok: number;
}

function ratesFrom(inputPerMTok: number, outputPerMTok: number): Rates {
  return {
    inputPerMTok,
    outputPerMTok,
    cacheWrite1hPerMTok: inputPerMTok * 2,
    cacheWrite5mPerMTok: inputPerMTok * 1.25,
    cacheReadPerMTok: inputPerMTok / 10,
  };
}

/**
 * List prices, USD per million tokens, by model-id prefix. (Sonnet 5 has an
 * intro rate of $2/$10 through 2026-08-31, so real spend runs lower until
 * then.) The playground can override the model per wake — costs must follow
 * the model that actually ran, not the default.
 */
const RATES_BY_MODEL_PREFIX: Array<[prefix: string, rates: Rates]> = [
  ["claude-sonnet-5", ratesFrom(3, 15)],
  ["claude-sonnet-4", ratesFrom(3, 15)],
  ["claude-opus", ratesFrom(5, 25)],
  ["claude-haiku", ratesFrom(1, 5)],
];

export const SONNET_5_RATES = ratesFrom(3, 15);

function ratesFor(model: string | undefined): Rates {
  if (model) {
    for (const [prefix, rates] of RATES_BY_MODEL_PREFIX) {
      if (model.startsWith(prefix)) return rates;
    }
  }
  return SONNET_5_RATES;
}

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

export function usageToCost(usage: Usage, model?: string): number {
  const rates = ratesFor(model);
  const m = 1_000_000;
  // Only the system breakpoint uses the 1h TTL; the user-turn and moving
  // breakpoints write at the 5m rate. Without the split (older fixtures),
  // bill everything at the 1h rate — an overstatement, never an understatement.
  const write1h = usage.cacheWrite1h ?? usage.cacheWrite;
  const write5m = usage.cacheWrite - write1h;
  return (
    (usage.input / m) * rates.inputPerMTok +
    (usage.output / m) * rates.outputPerMTok +
    (write1h / m) * rates.cacheWrite1hPerMTok +
    (write5m / m) * rates.cacheWrite5mPerMTok +
    (usage.cacheRead / m) * rates.cacheReadPerMTok
  );
}
