"use client";
import React, { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import type { HighlightWithUtterances } from "@/lib/db/highlights";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Clock } from "lucide-react";
import { useHighlight } from "./HighlightContext";
import { CreateHighlightButton } from "./CreateHighlightButton";
import { useTranscriptOptions } from "./options/OptionsContext";
import { HighlightsGrid, type HighlightCardData } from "@/components/highlights/HighlightCards";

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

export default function HighlightsList() {
  const { highlights, subjects } = useCouncilMeetingData();
  const { calculateHighlightData } = useHighlight();
  const { options } = useTranscriptOptions();
  const { data: session } = useSession();
  const canCreateHighlights = options.canCreateHighlights;
  const t = useTranslations('highlights');

  const isAdmin = options.editsAllowed;
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const currentUserId = session?.user?.id;

  const toCardData = useCallback((highlight: HighlightWithUtterances): HighlightCardData => {
    const statistics = calculateHighlightData(highlight)?.statistics;
    return {
      id: highlight.id,
      name: highlight.name,
      isShowcased: highlight.isShowcased,
      hasVideo: !!highlight.videoUrl,
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
    };
  }, [calculateHighlightData, subjects, isAdmin, t]);

  const { myHighlights, othersHighlights, aiHighlights, userHighlights } = useMemo(() => {
    const my: HighlightCardData[] = [];
    const others: HighlightCardData[] = [];
    const ai: HighlightCardData[] = [];
    // All non-AI highlights in original order — the regular-user view
    const user: HighlightCardData[] = [];

    for (const h of highlights) {
      const card = toCardData(h);
      if (h.createdById === null) {
        ai.push(card);
      } else {
        user.push(card);
        if (h.createdById === currentUserId) {
          my.push(card);
        } else {
          others.push(card);
        }
      }
    }

    return { myHighlights: my, othersHighlights: others, aiHighlights: ai, userHighlights: user };
  }, [highlights, currentUserId, toCardData]);

  const createButton = canCreateHighlights ? <AddHighlightButton /> : undefined;

  // Regular users: no tabs, AI highlights already filtered out defensively above
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">{t('title')}</h2>
          <p className="text-sm text-muted-foreground mb-3 text-center">
            {t('description')}
          </p>
        </div>
        <HighlightsGrid items={userHighlights} createButton={createButton} />
      </div>
    );
  }

  // Admin / superadmin: tabbed view
  return (
    <div className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mb-3 text-center">
          {t('description')}
        </p>
      </div>

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
          <HighlightsGrid items={myHighlights} createButton={createButton} />
        </TabsContent>

        <TabsContent value="others">
          <HighlightsGrid items={othersHighlights} />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="ai">
            <HighlightsGrid items={aiHighlights} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
