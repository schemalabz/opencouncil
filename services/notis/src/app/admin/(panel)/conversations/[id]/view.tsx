"use client";

import { useEffect, useRef, useState } from "react";
import { WakeTrace } from "@/agent/types";
import { ConversationView } from "../../_components/ConversationView";
import { fmtDate } from "../../_lib/format";
import { PageHeader } from "../../_components/PageHeader";
import { StopBadge } from "../../_components/StopBadge";
import { ConversationDetail } from "../../_lib/conversations";

/**
 * A real conversation, read-only: the exact same surface as the playground,
 * with every simulator affordance omitted. Traces load lazily per selected
 * wake — a full WakeTrace is heavy, and the inspector shows one at a time.
 */
export function ConversationDetailView({ detail }: { detail: ConversationDetail }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [traces, setTraces] = useState<Record<string, WakeTrace>>({});
  const inFlight = useRef(new Set<string>());
  const s = detail.summary;

  useEffect(() => {
    if (!selectedId || traces[selectedId] || inFlight.current.has(selectedId)) return;
    inFlight.current.add(selectedId);
    fetch(`/api/admin/wakes/${selectedId}/trace`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { trace?: WakeTrace } | null) => {
        if (body?.trace) setTraces((prev) => ({ ...prev, [selectedId]: body.trace! }));
      })
      .catch(() => undefined)
      .finally(() => inFlight.current.delete(selectedId));
  }, [selectedId, traces]);

  return (
    <>
      <PageHeader title={s.userName}>
        <span className="truncate text-xs text-muted-foreground">
          {s.phone} · {s.cityNames.join(", ")} · από {fmtDate(s.startedAt)}
        </span>
        {s.unsubscribedAt && <StopBadge at={s.unsubscribedAt} />}
      </PageHeader>
      <ConversationView
        records={detail.records}
        cityMeta={detail.cityMeta}
        clock={s.lastActivityAt}
        origin={s.origin}
        startAt={s.startedAt}
        profile={detail.profile}
        upcoming={detail.upcoming}
        selectedId={selectedId}
        onSelect={setSelectedId}
        traceFor={(id) => traces[id]}
      />
    </>
  );
}
