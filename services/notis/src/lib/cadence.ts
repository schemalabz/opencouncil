/**
 * How often the poller runs, in one place with no imports of its own.
 *
 * Enrollment happens in the poller and nowhere else, so this is what a new
 * reader waits between finishing the signup and their first message. Every
 * per-tick ceiling in poller.ts is therefore a rate: halve the interval and
 * you double the readers per hour that ceiling releases.
 *
 * The admin panel counts down to the next tick from this number too. It kept
 * its own copy once, the two drifted, and the heartbeat then counted down to
 * a tick three minutes after the real one — so an operator could not tell a
 * healthy poller from a wedged one. This module stays dependency-free so both
 * the runtime and the panel can read it without pulling anything else in.
 */
export const POLLER_INTERVAL_MS = 2 * 60_000;

/** «κάθε 2′» — the interval as the panel prints it beside the heartbeat. */
export const POLLER_INTERVAL_LABEL = `κάθε ${POLLER_INTERVAL_MS / 60_000}′`;
