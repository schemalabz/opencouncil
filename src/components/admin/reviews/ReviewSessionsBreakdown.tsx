'use client'
import { UnifiedReviewSession } from '@/lib/db/reviews';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, FileEdit, Coffee, User, Crown, Info } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatDurationMs, formatTime } from '@/lib/formatters/time';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface ReviewSessionsBreakdownProps {
  sessions: UnifiedReviewSession[];
  totalReviewTimeMs: number;
  meetingDurationMs: number;
  reviewEfficiency: number | null;
}

export function ReviewSessionsBreakdown({
  sessions,
  totalReviewTimeMs,
  meetingDurationMs,
  reviewEfficiency,
}: ReviewSessionsBreakdownProps) {
  const t = useTranslations('reviews.sessionBreakdown');

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('noSessions')}
      </div>
    );
  }

  // Calculate actual total time from all sessions (all reviewers)
  const actualTotalReviewTimeMs = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  
  // Calculate actual efficiency based on all reviewers' time
  const actualReviewEfficiency = meetingDurationMs > 0 && actualTotalReviewTimeMs > 0
    ? actualTotalReviewTimeMs / meetingDurationMs
    : null;

  // Group sessions by reviewer to show individual contributions
  const reviewerStats = new Map<string, { 
    reviewerId: string;
    name: string; 
    isPrimary: boolean; 
    totalTimeMs: number; 
    sessionCount: number;
  }>();
  
  for (const session of sessions) {
    const existing = reviewerStats.get(session.reviewerId);
    if (existing) {
      existing.totalTimeMs += session.durationMs;
      existing.sessionCount++;
    } else {
      reviewerStats.set(session.reviewerId, {
        reviewerId: session.reviewerId,
        name: session.reviewerName || session.reviewerEmail,
        isPrimary: session.isPrimaryReviewer,
        totalTimeMs: session.durationMs,
        sessionCount: 1,
      });
    }
  }
  
  // Sort reviewers: primary first, then by time
  const reviewerStatsArray = Array.from(reviewerStats.values()).sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return b.totalTimeMs - a.totalTimeMs;
  });

  // Calculate breaks between sessions (in the unified chronological timeline)
  const breaks: Array<{ afterSessionIndex: number; durationMs: number }> = [];
  for (let i = 0; i < sessions.length - 1; i++) {
    const breakDuration = sessions[i + 1].startTime.getTime() - sessions[i].endTime.getTime();
    if (breakDuration > 0) {
      breaks.push({
        afterSessionIndex: i,
        durationMs: breakDuration,
      });
    }
  }

  return (
    <div className="space-y-6 py-4">
      {/* Overview Section */}
      {meetingDurationMs > 0 && actualReviewEfficiency !== null && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Main Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">{t('meetingDuration')}</div>
                  <div className="text-lg font-semibold">{formatDurationMs(meetingDurationMs)}</div>
                </div>
                
                <div>
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    {t('totalReviewTime')}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">{t('explanation.title')}</p>
                          <p className="text-xs">{t('explanation.description')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-lg font-semibold">{formatDurationMs(actualTotalReviewTimeMs)}</div>
                </div>
                
                <div>
                  <div className="text-muted-foreground mb-1">{t('reviewEfficiency')}</div>
                  <div className="text-lg font-semibold">
                    1:{actualReviewEfficiency.toFixed(1)}
                  </div>
                </div>
              </div>
              
              {/* Reviewer Breakdown */}
              {reviewerStatsArray.length > 1 && (
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground mb-2">{t('reviewerBreakdown')}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {reviewerStatsArray.map((reviewer) => (
                      <div key={reviewer.reviewerId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {reviewer.isPrimary ? (
                            <Badge variant="default" className="text-xs py-0">
                              <Crown className="h-3 w-3 mr-1" />
                              {reviewer.name}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs py-0">
                              <User className="h-3 w-3 mr-1" />
                              {reviewer.name}
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          {formatDurationMs(reviewer.totalTimeMs)} ({reviewer.sessionCount} {t('sessions')})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Vertical Timeline of All Review Sessions */}
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          {t('reviewTimeline')} ({sessions.length} {t('sessions')})
        </h3>
        <div className="text-sm text-muted-foreground mb-6">
          {t('timelineDescription')}
        </div>
        
        {/* Timeline Container */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          
          {/* Sessions */}
          <div className="space-y-8">
            {sessions.map((session, index) => {
              const nextBreak = breaks.find(b => b.afterSessionIndex === index);
              
              return (
                <div key={index} className="relative">
                  {/* Timeline Node */}
                  <div className="absolute left-0 top-6 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center z-10">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                  </div>
                  
                  {/* Session Card */}
                  <div className="ml-14">
                    <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(session.startTime, 'MMM d, h:mm a')} - {format(session.endTime, 'h:mm a')}
                    </div>
                    
                    <Card className={session.isPrimaryReviewer ? 'border-primary/50 shadow-sm' : 'shadow-sm'}>
                      <CardContent className="pt-4 pb-4">
                        <div className="space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {session.isPrimaryReviewer ? (
                                <Badge variant="default" className="flex items-center gap-1">
                                  <Crown className="h-3 w-3" />
                                  {t('primaryReviewer')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {t('reviewer')}
                                </Badge>
                              )}
                              <span className="text-sm font-medium">
                                {session.reviewerName || session.reviewerEmail}
                              </span>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {t('session')} {index + 1}
                            </span>
                          </div>
                          
                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t">
                            <div>
                              <div className="text-muted-foreground mb-1">{t('duration')}</div>
                              <div className="font-semibold">{formatDurationMs(session.durationMs)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">{t('utterancesCovered')}</div>
                              <div className="font-semibold">{session.utterancesCovered}</div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-muted-foreground mb-1">{t('meetingContent')}</div>
                              <div className="font-semibold">
                                {formatTime(session.meetingStartTimestamp)} - {formatTime(session.meetingEndTimestamp)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Break Indicator */}
                  {nextBreak && (
                    <div className="ml-14 mt-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Coffee className="h-4 w-4" />
                        <span>{t('break')}: {formatDurationMs(nextBreak.durationMs)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

