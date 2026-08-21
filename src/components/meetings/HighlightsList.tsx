"use client";
import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import type { HighlightWithUtterances } from "@/lib/db/highlights";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clapperboard, Clock, Play, Star } from "lucide-react";
import { useHighlight } from "./HighlightContext";
import { CreateHighlightButton } from "./CreateHighlightButton";
import { useTranscriptOptions } from "./options/OptionsContext";
import { generateHighlightFileName } from "@/lib/export/download";
import { HighlightsGrid } from "@/components/highlights/HighlightsGrid";
import type { HighlightCardData } from "@/components/highlights/HighlightCard";

const AddHighlightButton = () => {
  const { editingHighlight } = useHighlight();
  const t = useTranslations('highlights');

  return (
    <div className="p-4 border-b">
      {editingHighlight && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center space-x-2 text-sm text-amber-800">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">{t('highlightCard.currentlyEditing')}</span>
            <span className="font-semibold truncate">{editingHighlight.name}</span>
          </div>
          <p className="text-xs text-amber-700 mt-1 ml-6">
            {t('highlightCard.finishEditingDescription')}
          </p>
        </div>
      )}
      <CreateHighlightButton
        variant="full"
        size="lg"
      />
    </div>
  );
};

/**
 * The meeting's highlights, split by how far along they are: showcased first,
 * then the ones with a video, then the ones still being rendered.
 */
function HighlightSections({
  items,
  action,
  onRenamed,
  onDeleted,
}: {
  items: HighlightCardData[];
  action?: React.ReactNode;
  onRenamed?: (id: string, name: string) => void;
  onDeleted?: (id: string) => void;
}) {
  const t = useTranslations('highlights');

  const showcased = items.filter(item => item.isShowcased);
  const withVideo = items.filter(item => item.video && !item.isShowcased);
  const drafts = items.filter(item => !item.video && !item.isShowcased);

  if (items.length === 0) {
    return <HighlightsGrid items={[]} surface="meeting" action={action} />;
  }

  const sections = [
    { key: 'showcased', icon: Star, className: 'text-yellow-500', items: showcased },
    { key: 'video', icon: Play, className: 'text-green-500', items: withVideo },
    { key: 'draft', icon: Clock, className: 'text-blue-500', items: drafts },
  ].filter(section => section.items.length > 0);

  return (
    <div className="space-y-8">
      {action && <div className="flex justify-center">{action}</div>}
      {sections.map(({ key, icon: Icon, className, items: sectionItems }) => (
        <section key={key}>
          <h3 className="mb-4 flex items-center text-lg font-semibold">
            <Icon className={`mr-2 h-5 w-5 ${className}`} />
            {t(`sections.${key}`)}
          </h3>
          <HighlightsGrid
            items={sectionItems}
            surface="meeting"
            onRenamed={onRenamed}
            onDeleted={onDeleted}
          />
        </section>
      ))}
      {drafts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {t('highlightCard.allHighlightsProcessed')}
        </p>
      )}
    </div>
  );
}

export default function HighlightsList() {
  // The meeting's highlights live in this client context, seeded once from the
  // server. router.refresh() re-renders the server tree but leaves that state
  // alone, so a rename or a delete has to be applied here too.
  const { highlights, subjects, updateHighlight, removeHighlight } = useCouncilMeetingData();
  const { calculateHighlightData } = useHighlight();
  const { options } = useTranscriptOptions();
  const { data: session } = useSession();
  const canCreateHighlights = options.canCreateHighlights;
  const t = useTranslations('highlights');

  const isAdmin = options.editsAllowed;
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const currentUserId = session?.user?.id;

  // Not memoized: calculateHighlightData keeps a stable identity across
  // transcript and speaker-tag changes, so a memo keyed on it would hold the
  // statistics from the first render even after an edit changes them.
  const toCardData = (highlight: HighlightWithUtterances): HighlightCardData => {
    const statistics = calculateHighlightData(highlight)?.statistics;
    return {
      id: highlight.id,
      name: highlight.name,
      isShowcased: highlight.isShowcased,
      updatedAt: highlight.updatedAt,
      href: `/${highlight.cityId}/${highlight.meetingId}/highlights/${highlight.id}`,
      duration: statistics?.duration || 0,
      speakerCount: statistics?.speakerCount || 0,
      utteranceCount: statistics?.utteranceCount || 0,
      subjectName: highlight.subjectId
        ? (subjects.find(s => s.id === highlight.subjectId)?.name || t('common.connectedSubject'))
        : null,
      // Only show creator for city editors (they can see all highlights)
      creatorName: isAdmin ? highlight.createdBy?.name ?? null : null,
      // Same rule the server applies: an editor of the city, or the author.
      canManage: isAdmin || (!!currentUserId && highlight.createdById === currentUserId),
      video: highlight.videoUrl
        ? {
          url: highlight.videoUrl,
          playbackId: highlight.muxPlaybackId,
          fileName: generateHighlightFileName(highlight.cityId, highlight.meetingId, highlight.name),
        }
        : undefined,
    };
  };

  // The partition depends on the highlights alone, so it is safe to memoize.
  const { myHighlights, othersHighlights, aiHighlights, userHighlights } = useMemo(() => {
    const my: HighlightWithUtterances[] = [];
    const others: HighlightWithUtterances[] = [];
    const ai: HighlightWithUtterances[] = [];
    // All non-AI highlights in original order — the regular-user view
    const user: HighlightWithUtterances[] = [];

    for (const h of highlights) {
      if (h.createdById === null) {
        ai.push(h);
      } else {
        user.push(h);
        if (h.createdById === currentUserId) {
          my.push(h);
        } else {
          others.push(h);
        }
      }
    }

    return { myHighlights: my, othersHighlights: others, aiHighlights: ai, userHighlights: user };
  }, [highlights, currentUserId]);

  const createButton = canCreateHighlights ? <AddHighlightButton /> : undefined;
  const handleRenamed = (id: string, name: string) => updateHighlight(id, { name });
  const handleDeleted = (id: string) => removeHighlight(id);

  const header = (
    <div className="bg-muted/50 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-2">{t('title')}</h2>
      <p className="text-sm text-muted-foreground mb-3 text-center">
        {t('description')}
      </p>
    </div>
  );

  // Regular users: no tabs, AI highlights already filtered out defensively above
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {header}
        <HighlightSections items={userHighlights.map(toCardData)} action={createButton} onRenamed={handleRenamed} onDeleted={handleDeleted} />
      </div>
    );
  }

  // Admin / superadmin: tabbed view
  return (
    <div className="space-y-6">
      {header}

      <Tabs defaultValue="mine" searchParam="highlights-tab">
        <TabsList>
          <TabsTrigger value="mine">
            {t('tabs.myHighlights')} ({myHighlights.length})
          </TabsTrigger>
          <TabsTrigger value="others">
            {t('tabs.othersHighlights')} ({othersHighlights.length})
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="ai">
              {t('tabs.aiGenerated')} ({aiHighlights.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine">
          <HighlightSections items={myHighlights.map(toCardData)} action={createButton} onRenamed={handleRenamed} onDeleted={handleDeleted} />
        </TabsContent>

        <TabsContent value="others">
          <HighlightSections items={othersHighlights.map(toCardData)} onRenamed={handleRenamed} onDeleted={handleDeleted} />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="ai">
            <HighlightSections items={aiHighlights.map(toCardData)} onRenamed={handleRenamed} onDeleted={handleDeleted} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
