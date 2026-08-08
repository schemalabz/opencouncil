"use client";

import { useState } from "react";
import { ConversationView } from "../../_components/ConversationView";
import { PageHeader } from "../../_components/PageHeader";
import { ConversationDetail } from "../../_lib/conversations";

/**
 * A real conversation, read-only: the exact same surface as the playground,
 * with every simulator affordance omitted.
 */
export function ConversationDetailView({ detail }: { detail: ConversationDetail }) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const s = detail.summary;

  return (
    <>
      <PageHeader title={s.userName}>
        <span className="truncate text-xs text-muted-foreground">
          {s.phone} · {s.cityNames.join(", ")} · από {s.startedAt.slice(0, 10)}
        </span>
        {s.unsubscribedAt && (
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            ΣΤΟΠ · {s.unsubscribedAt.slice(0, 10)}
          </span>
        )}
      </PageHeader>
      <ConversationView
        records={detail.records}
        cityMeta={detail.cityMeta}
        clock={s.lastActivityAt}
        origin={s.origin}
        startAt={s.startedAt}
        profile={detail.profile}
        selectedId={selectedId}
        onSelect={setSelectedId}
        traceFor={(id) => detail.traces[id]}
      />
    </>
  );
}
