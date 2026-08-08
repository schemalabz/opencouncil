"use client";

import { useState } from "react";
import { ConversationView } from "../../_components/ConversationView";
import { PageHeader } from "../../_components/PageHeader";
import { StopBadge } from "../../_components/StopBadge";
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
        {s.unsubscribedAt && <StopBadge at={s.unsubscribedAt} />}
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
