"use client";

import { useState, useMemo } from 'react';
import { StatsCard, StatsCardItem } from '@/components/ui/stats-card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Search, Clock, Activity, CalendarClock, ArrowUpDown, ChevronDown } from 'lucide-react';

interface BackoffTier {
  afterDays: number;
  minIntervalDays: number;
}

interface DiscoveryDetail {
  cityId: string;
  meetingId: string;
  meetingDate: string;
  subjectId: string;
  subjectName: string;
  ada: string | null;
  issueDate: string | null;
  discoveredAt: string;
  firstPollAt: string;
  totalPollsForMeeting: number;
  discoveryDelayDays: number | null;
  pollingDurationDays: number;
  publishDelayDays: number | null;
}

interface RecentPoll {
  id: string;
  createdAt: string;
  status: string;
  councilMeetingId: string;
  cityId: string;
  subjectsPolled: number;
  matchesFound: number | null;
  unmatchedCount: number | null;
  ambiguousCount: number | null;
}

interface PollingStatsData {
  backoffSchedule: BackoffTier[];
  maxPollingDays: number;
  summary: {
    totalDiscoveries: number;
    meetingsStillPolling: number;
    discoveryDelay: {
      avgDays: number | null;
      medianDays: number | null;
      minDays: number | null;
      maxDays: number | null;
    };
    publishDelay: {
      description: string;
      avgDays: number | null;
      medianDays: number | null;
      minDays: number | null;
      maxDays: number | null;
    };
  };
  discoveries: DiscoveryDetail[];
  recentPolls: RecentPoll[];
}

type SortField = 'discoveredAt' | 'meetingDate' | 'discoveryDelayDays' | 'publishDelayDays' | 'totalPollsForMeeting';
type SortDirection = 'asc' | 'desc';

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days}d`;
}

function getTierLabel(afterDays: number, minIntervalDays: number): string {
  if (minIntervalDays === 0) return 'Every cron run';
  return `Every ${minIntervalDays}d`;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'succeeded': return 'default';
    case 'pending': return 'secondary';
    case 'failed': return 'destructive';
    default: return 'outline';
  }
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <Badge variant="secondary" className="font-normal">{badge}</Badge>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function PollingStats({ stats }: { stats: PollingStatsData }) {
  const [sortField, setSortField] = useState<SortField>('discoveredAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedDiscoveries = useMemo(() => {
    return [...stats.discoveries].sort((a, b) => {
      const getValue = (item: DiscoveryDetail) => {
        switch (sortField) {
          case 'discoveredAt': return new Date(item.discoveredAt).getTime();
          case 'meetingDate': return new Date(item.meetingDate).getTime();
          case 'discoveryDelayDays': return item.discoveryDelayDays ?? -1;
          case 'publishDelayDays': return item.publishDelayDays ?? -1;
          case 'totalPollsForMeeting': return item.totalPollsForMeeting;
        }
      };
      const aVal = getValue(a);
      const bVal = getValue(b);
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [stats.discoveries, sortField, sortDirection]);

  const summaryItems: StatsCardItem[] = [
    {
      title: 'Total Discoveries',
      value: stats.summary.totalDiscoveries,
      icon: <Search className="h-4 w-4" />,
      description: 'Decisions found by polling',
    },
    {
      title: 'Meetings Still Polling',
      value: stats.summary.meetingsStillPolling,
      icon: <Activity className="h-4 w-4" />,
      description: 'With unlinked subjects',
    },
    {
      title: 'Avg Discovery Delay',
      value: formatDays(stats.summary.discoveryDelay.avgDays),
      icon: <Clock className="h-4 w-4" />,
      description: stats.summary.discoveryDelay.medianDays !== null
        ? `Median: ${formatDays(stats.summary.discoveryDelay.medianDays)}`
        : 'From publication to discovery',
    },
    {
      title: 'Avg Publish Delay',
      value: formatDays(stats.summary.publishDelay.avgDays),
      icon: <CalendarClock className="h-4 w-4" />,
      description: stats.summary.publishDelay.medianDays !== null
        ? `Median: ${formatDays(stats.summary.publishDelay.medianDays)}`
        : 'From meeting to Diavgeia publication',
    },
  ];

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-foreground' : 'text-muted-foreground/50'}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <StatsCard items={summaryItems} columns={4} />

      {/* Recent Polls */}
      <CollapsibleSection
        title="Recent Polls"
        badge={`${stats.recentPolls.length} polls`}
        defaultOpen
      >
        {stats.recentPolls.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No poll tasks recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">City</th>
                  <th className="text-left px-4 py-2 font-medium">Meeting ID</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Subjects Polled</th>
                  <th className="text-left px-4 py-2 font-medium">Matches Found</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentPolls.map(poll => (
                  <tr key={poll.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(poll.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{poll.cityId}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{poll.councilMeetingId}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Badge variant={statusBadgeVariant(poll.status)}>{poll.status}</Badge>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-center">{poll.subjectsPolled}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-center">
                      {poll.matchesFound !== null ? (
                        <span>
                          {poll.matchesFound}
                          {(poll.unmatchedCount !== null && poll.unmatchedCount > 0) && (
                            <span className="text-muted-foreground ml-1" title="unmatched">
                              / {poll.unmatchedCount} unmatched
                            </span>
                          )}
                          {(poll.ambiguousCount !== null && poll.ambiguousCount > 0) && (
                            <span className="text-yellow-600 ml-1" title="ambiguous">
                              / {poll.ambiguousCount} ambiguous
                            </span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Discoveries */}
      <CollapsibleSection
        title="Discoveries"
        badge={`${stats.discoveries.length} discoveries`}
      >
        {sortedDiscoveries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No decisions discovered by polling yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="meetingDate">Meeting</SortHeader>
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">ADA</th>
                  <th className="text-left px-4 py-2 font-medium">Diavgeia Published</th>
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="discoveredAt">Discovered</SortHeader>
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="discoveryDelayDays">Discovery Delay</SortHeader>
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="publishDelayDays">Publish Delay</SortHeader>
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="totalPollsForMeeting">Polls</SortHeader>
                  </th>
                </tr>
              </thead>
              <TooltipProvider>
                <tbody>
                  {sortedDiscoveries.map(d => (
                    <tr key={`${d.subjectId}-${d.ada}`} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-2 whitespace-nowrap">{d.meetingDate}</td>
                      <td className="px-4 py-2 max-w-[200px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate">{d.subjectName}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm">
                            {d.subjectName}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{d.ada ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{d.issueDate ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {new Date(d.discoveredAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDays(d.discoveryDelayDays)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDays(d.publishDelayDays)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-center">{d.totalPollsForMeeting}</td>
                    </tr>
                  ))}
                </tbody>
              </TooltipProvider>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Backoff Schedule */}
      <CollapsibleSection
        title="Backoff Schedule"
        badge={`${stats.backoffSchedule.length} tiers`}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-4 py-2 font-medium">Days Since First Poll</th>
              <th className="text-left px-4 py-2 font-medium">Min Interval</th>
              <th className="text-left px-4 py-2 font-medium">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {stats.backoffSchedule.map((tier, i) => {
              const nextTier = stats.backoffSchedule[i + 1];
              const rangeEnd = nextTier ? nextTier.afterDays : stats.maxPollingDays;
              return (
                <tr key={tier.afterDays} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    Day {tier.afterDays}–{rangeEnd}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {tier.minIntervalDays === 0 ? 'None' : `${tier.minIntervalDays} days`}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {getTierLabel(tier.afterDays, tier.minIntervalDays)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30">
              <td className="px-4 py-2 text-muted-foreground" colSpan={3}>
                Automatic polling stops after {stats.maxPollingDays} days
              </td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </div>
  );
}
