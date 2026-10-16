/**
 * The stage a task shows between the arrival of its result and the end of the
 * handler that writes it. The panel shows the stage of a pending task.
 */
export const RESULT_PERSISTING_STAGE = 'persisting results';

/**
 * How long a claim (a pending task with a payload) is left alone before a
 * replay may finish it. The handler may still be running: the claim write is
 * the row's last update until the flip, so a young claim is a live one.
 * Above the 10-minute transaction budget of the transcribe handler.
 */
export const CLAIM_REPLAY_AFTER_MS = 15 * 60_000;
