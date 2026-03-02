"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { StatsCard, StatsCardItem } from '@/components/ui/stats-card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Search, Clock, Activity, CalendarClock, ArrowUpDown, ChevronDown, Eye, Copy, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useUrlParams } from '@/hooks/useUrlParams';
import { formatRelativeTime } from '@/lib/formatters/time';

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
  publishDate: string | null;
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
  requestBody: string;
  responseBody: string | null;
}

interface StillPollingMeeting {
  cityId: string;
  meetingId: string;
  meetingDate: string;
  unlinkedSubjects: Array<{ id: string; name: string }>;
  totalEligibleSubjects: number;
  totalPolls: number;
  firstPollAt: string | null;
  lastPollAt: string | null;
  currentTierLabel: string | null;
  nextPollEligible: string | null;
}

interface PollingStatsData {
  backoffSchedule: BackoffTier[];
  maxPollingDays: number;
  meetingsStillPolling: StillPollingMeeting[];
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
  pollCities: string[];
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

function CopyableJsonSection({ label, json }: { label: string; json: string }) {
  const [copied, setCopied] = useState(false);

  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    formatted = json;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="flex items-center gap-1 h-7 text-xs"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <Textarea
        value={formatted}
        readOnly
        className="min-h-[200px] font-mono text-xs resize-none bg-muted/30"
        style={{
          whiteSpace: 'pre',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace'
        }}
      />
      <div className="text-xs text-muted-foreground">
        {formatted.length.toLocaleString()} characters
      </div>
    </div>
  );
}

function CollapsibleSection({
  id,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  badge: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div id={id} className="border rounded-lg">
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

export function PollingStats({ stats, pollCities, cityFilter, pollMeetings, meetingFilter }: { stats: PollingStatsData; pollCities: string[]; cityFilter?: string; pollMeetings: string[]; meetingFilter?: string }) {
  const [sortField, setSortField] = useState<SortField>('discoveredAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPoll, setSelectedPoll] = useState<RecentPoll | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<StillPollingMeeting | null>(null);
  const { updateParam, updateParams, isPending } = useUrlParams('recent-polls');

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
      value: stats.meetingsStillPolling.length,
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
    <>
    <Sheet open={!!selectedPoll} onOpenChange={(open) => !open && setSelectedPoll(null)}>
    <div className="space-y-6">
      {/* Summary Cards */}
      <StatsCard items={summaryItems} columns={4} />

      {/* Meetings Still Polling */}
      <CollapsibleSection
        id="still-polling"
        title="Meetings Still Polling"
        badge={`${stats.meetingsStillPolling.length} meetings`}
        defaultOpen={stats.meetingsStillPolling.length > 0}
      >
        {stats.meetingsStillPolling.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No meetings are currently being polled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">City</th>
                  <th className="text-left px-4 py-2 font-medium">Meeting ID</th>
                  <th className="text-left px-4 py-2 font-medium">Meeting Date</th>
                  <th className="text-left px-4 py-2 font-medium">Unlinked</th>
                  <th className="text-left px-4 py-2 font-medium">Polls</th>
                  <th className="text-left px-4 py-2 font-medium">First Poll</th>
                  <th className="text-left px-4 py-2 font-medium">Last Poll</th>
                  <th className="text-left px-4 py-2 font-medium">Backoff</th>
                  <th className="text-right px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <TooltipProvider>
              <tbody>
                {stats.meetingsStillPolling.map(m => (
                  <tr key={`${m.cityId}:${m.meetingId}`} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{m.cityId}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{m.meetingId}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{m.meetingDate}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {m.unlinkedSubjects.length} / {m.totalEligibleSubjects}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-center">{m.totalPolls}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {m.firstPollAt ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block cursor-default">{new Date(m.firstPollAt).toLocaleDateString()}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{new Date(m.firstPollAt).toLocaleString()}</TooltipContent>
                        </Tooltip>
                      ) : 'Never'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {m.lastPollAt ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block cursor-default">{formatRelativeTime(new Date(m.lastPollAt), 'en')}</span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{new Date(m.lastPollAt).toLocaleString()}</TooltipContent>
                        </Tooltip>
                      ) : 'Never'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs">
                      {m.currentTierLabel ?? '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMeeting(m)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </TooltipProvider>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Recent Polls */}
      <CollapsibleSection
        id="recent-polls"
        title="Recent Polls"
        badge={cityFilter ? `${stats.recentPolls.length} polls (${cityFilter}${meetingFilter ? ` / ${meetingFilter}` : ''})` : `${stats.recentPolls.length} polls`}
        defaultOpen
      >
        {pollCities.length > 1 && (
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Select
              value={cityFilter ?? 'all'}
              onValueChange={(value) => updateParams({
                cityId: value === 'all' ? null : value,
                councilMeetingId: null,
              })}
              disabled={isPending}
            >
              <SelectTrigger className="w-48" disabled={isPending}>
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {pollCities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cityFilter && pollMeetings.length > 0 && (
              <Select
                value={meetingFilter ?? 'all'}
                onValueChange={(value) => updateParam('councilMeetingId', value === 'all' ? null : value)}
                disabled={isPending}
              >
                <SelectTrigger className="w-64" disabled={isPending}>
                  <SelectValue placeholder="All meetings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All meetings</SelectItem>
                  {pollMeetings.map(id => (
                    <SelectItem key={id} value={id}>{id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        )}
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
                  <th className="text-right px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <TooltipProvider>
              <tbody>
                {stats.recentPolls.map(poll => (
                  <tr key={poll.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block cursor-default">{formatRelativeTime(new Date(poll.createdAt), 'en')}</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{new Date(poll.createdAt).toLocaleString()}</TooltipContent>
                      </Tooltip>
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
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPoll(poll)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </TooltipProvider>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* Discoveries */}
      <CollapsibleSection
        id="discoveries"
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
                  <th className="text-left px-4 py-2 font-medium">City</th>
                  <th className="text-left px-4 py-2 font-medium">Meeting ID</th>
                  <th className="text-left px-4 py-2 font-medium">
                    <SortHeader field="meetingDate">Meeting Date</SortHeader>
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
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{d.cityId}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{d.meetingId}</td>
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
                      <td className="px-4 py-2 whitespace-nowrap">{d.publishDate ?? '—'}</td>
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
        id="backoff-schedule"
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

    {/* Poll Details Sidebar */}
    {selectedPoll && (
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Poll Details</SheetTitle>
          <SheetDescription>
            Task {selectedPoll.id}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Status</div>
              <Badge variant={statusBadgeVariant(selectedPoll.status)}>{selectedPoll.status}</Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Time</div>
              <div className="text-sm font-medium">{new Date(selectedPoll.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">City</div>
              <div className="text-sm font-mono">{selectedPoll.cityId}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Meeting</div>
              <div className="text-sm font-mono">{selectedPoll.councilMeetingId}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Subjects Polled</div>
              <div className="text-sm font-medium">{selectedPoll.subjectsPolled}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Results</div>
              <div className="text-sm">
                {selectedPoll.matchesFound !== null ? (
                  <span>
                    <span className="font-medium">{selectedPoll.matchesFound}</span> matched
                    {(selectedPoll.unmatchedCount !== null && selectedPoll.unmatchedCount > 0) && (
                      <span className="text-muted-foreground"> · {selectedPoll.unmatchedCount} unmatched</span>
                    )}
                    {(selectedPoll.ambiguousCount !== null && selectedPoll.ambiguousCount > 0) && (
                      <span className="text-yellow-600"> · {selectedPoll.ambiguousCount} ambiguous</span>
                    )}
                  </span>
                ) : '—'}
              </div>
            </div>
          </div>

          {/* Meeting Admin Link */}
          <Link href={`/${selectedPoll.cityId}/${selectedPoll.councilMeetingId}/admin`}>
            <Button variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Meeting Admin
            </Button>
          </Link>

          {/* Request Body */}
          <CopyableJsonSection label="Request Body" json={selectedPoll.requestBody} />

          {/* Response Body */}
          {selectedPoll.responseBody ? (
            <CopyableJsonSection label="Response Body" json={selectedPoll.responseBody} />
          ) : (
            <div>
              <span className="text-sm font-medium">Response Body</span>
              <p className="text-sm text-muted-foreground mt-1">
                No response yet — task is still {selectedPoll.status}.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    )}
    </Sheet>

    {/* Still Polling Meeting Details Sidebar */}
    <Sheet open={!!selectedMeeting} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
    {selectedMeeting && (
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Meeting Polling Details</SheetTitle>
          <SheetDescription>
            {selectedMeeting.cityId} / {selectedMeeting.meetingId}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">City</div>
              <div className="text-sm font-mono">{selectedMeeting.cityId}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Meeting Date</div>
              <div className="text-sm font-medium">{selectedMeeting.meetingDate}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Backoff Tier</div>
              <div className="text-sm font-medium">{selectedMeeting.currentTierLabel ?? 'Not started'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Next Poll Eligible</div>
              <div className="text-sm font-medium">
                {selectedMeeting.nextPollEligible
                  ? new Date(selectedMeeting.nextPollEligible).toLocaleString()
                  : 'Next cron run'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Total Polls</div>
              <div className="text-sm font-medium">{selectedMeeting.totalPolls}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Last Poll</div>
              <div className="text-sm font-medium">
                {selectedMeeting.lastPollAt
                  ? `${formatRelativeTime(new Date(selectedMeeting.lastPollAt), 'en')} (${new Date(selectedMeeting.lastPollAt).toLocaleString()})`
                  : 'Never'}
              </div>
            </div>
          </div>

          {/* Meeting Admin Link */}
          <Link href={`/${selectedMeeting.cityId}/${selectedMeeting.meetingId}/admin`}>
            <Button variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Meeting Admin
            </Button>
          </Link>

          {/* Unlinked Subjects */}
          <div>
            <div className="text-sm font-medium mb-2">
              Unlinked Subjects ({selectedMeeting.unlinkedSubjects.length} / {selectedMeeting.totalEligibleSubjects})
            </div>
            {selectedMeeting.unlinkedSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">All subjects have linked decisions.</p>
            ) : (
              <ul className="space-y-2">
                {selectedMeeting.unlinkedSubjects.map(s => (
                  <li key={s.id} className="text-sm border rounded-md px-3 py-2 bg-muted/20">
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    )}
    </Sheet>
    </>
  );
}
