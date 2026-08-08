import { Usage } from "./types";

/**
 * claude-opus-5 pricing, USD per million tokens. Cache writes bill at 1.25x
 * input, cache reads at 0.1x.
 */
export const OPUS_5_RATES = {
  inputPerMTok: 5,
  outputPerMTok: 25,
  cacheWritePerMTok: 6.25,
  cacheReadPerMTok: 0.5,
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
    (usage.input / m) * OPUS_5_RATES.inputPerMTok +
    (usage.output / m) * OPUS_5_RATES.outputPerMTok +
    (usage.cacheWrite / m) * OPUS_5_RATES.cacheWritePerMTok +
    (usage.cacheRead / m) * OPUS_5_RATES.cacheReadPerMTok
  );
}
