import { WakeOutcome, WakeState, WakeTrace } from "@/agent/types";
import {
  PlaygroundStore,
  QueueItem,
  SNAPSHOT_CAP,
  Sim,
  Snapshot,
  STORAGE_KEY,
  TRACE_CAP,
} from "./types";
import { insertChronological } from "./deriveQueue";

export function emptyStore(): PlaygroundStore {
  return {
    version: 1,
    setup: { done: false, from: "" },
    sim: {
      state: { user: { name: "", cities: [] }, profile: "", journal: [] },
      clock: "",
      queue: [],
      cursor: 0,
      settings: {},
      origin: "transition",
    },
    traces: {},
    traceOrder: [],
    snapshots: [],
  };
}

export function loadStore(): PlaygroundStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as PlaygroundStore;
    if (parsed.version !== 1) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: PlaygroundStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded: drop the oldest traces and retry once.
    const slim: PlaygroundStore = { ...store, traces: {}, traceOrder: [] };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  }
}

export type Action =
  | { type: "reset" }
  | { type: "hydrate"; store: PlaygroundStore }
  | { type: "setupComplete"; sim: Sim; from: string }
  | { type: "briefReady"; itemId: string; event: QueueItem["event"] }
  | {
      type: "stepDone";
      itemId: string;
      outcome: WakeOutcome;
      trace: WakeTrace;
      nextState: WakeState;
      clock: string;
      snapshotLabel: string;
      delivery?: QueueItem["delivery"];
      /** Set when the item was a user message — reopens the 24h window. */
      userMessageAt?: string;
    }
  | { type: "skip"; itemId: string }
  | { type: "userMessage"; item: QueueItem }
  | { type: "setPromptOverride"; value?: string }
  | { type: "restoreSnapshot"; id: string };

function pushTrace(store: PlaygroundStore, id: string, trace: WakeTrace): PlaygroundStore {
  const traces = { ...store.traces, [id]: trace };
  const traceOrder = [...store.traceOrder.filter((t) => t !== id), id];
  while (traceOrder.length > TRACE_CAP) {
    const evicted = traceOrder.shift();
    if (evicted) delete traces[evicted];
  }
  return { ...store, traces, traceOrder };
}

function pushSnapshot(store: PlaygroundStore, label: string): PlaygroundStore {
  const snapshot: Snapshot = {
    id: `snap-${Date.now()}-${store.snapshots.length}`,
    label,
    takenAt: store.sim.clock,
    sim: JSON.parse(JSON.stringify(store.sim)) as Sim,
  };
  const snapshots = [...store.snapshots, snapshot];
  while (snapshots.length > SNAPSHOT_CAP) snapshots.shift();
  return { ...store, snapshots };
}

export function reducer(store: PlaygroundStore, action: Action): PlaygroundStore {
  switch (action.type) {
    case "reset":
      return emptyStore();

    case "hydrate":
      return action.store;

    case "setupComplete":
      return {
        ...emptyStore(),
        setup: { done: true, from: action.from },
        sim: action.sim,
      };

    case "briefReady":
      return {
        ...store,
        sim: {
          ...store.sim,
          queue: store.sim.queue.map((q) =>
            q.id === action.itemId ? { ...q, event: action.event } : q,
          ),
        },
      };

    case "stepDone": {
      const withSnapshot = pushSnapshot(store, action.snapshotLabel);
      const withTrace = pushTrace(withSnapshot, action.itemId, action.trace);
      let queue = withTrace.sim.queue.map((q) =>
        q.id === action.itemId
          ? {
              ...q,
              status: "done" as const,
              outcome: action.outcome,
              traceRef: action.itemId,
              ...(action.delivery ? { delivery: action.delivery } : {}),
            }
          : q,
      );
      for (const [i, wake] of action.outcome.scheduledWakes.entries()) {
        queue = insertChronological(queue, {
          id: `${action.itemId}:sched:${i}`,
          event: { type: "scheduled", at: wake.at, reason: wake.reason },
          status: "pending",
        });
      }
      return {
        ...withTrace,
        sim: {
          ...withTrace.sim,
          state: action.nextState,
          clock: action.clock,
          queue,
          cursor: queue.findIndex((q) => q.status === "pending"),
          ...(action.userMessageAt ? { lastUserMessageAt: action.userMessageAt } : {}),
        },
      };
    }

    case "skip": {
      const queue = store.sim.queue.map((q) =>
        q.id === action.itemId ? { ...q, status: "skipped" as const } : q,
      );
      return {
        ...store,
        sim: { ...store.sim, queue, cursor: queue.findIndex((q) => q.status === "pending") },
      };
    }

    case "userMessage": {
      const queue = insertChronological(store.sim.queue, action.item);
      return {
        ...store,
        sim: { ...store.sim, queue, cursor: queue.findIndex((q) => q.status === "pending") },
      };
    }

    case "setPromptOverride":
      return { ...store, sim: { ...store.sim, promptOverride: action.value } };

    case "restoreSnapshot": {
      const snap = store.snapshots.find((s) => s.id === action.id);
      if (!snap) return store;
      return { ...store, sim: JSON.parse(JSON.stringify(snap.sim)) as Sim };
    }
  }
}
