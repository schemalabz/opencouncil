"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useUrlParams } from "@/hooks/useUrlParams";

export type ReviewSort = 'date' | 'longestWait';

interface ReviewFiltersProps {
  show: 'needsAttention' | 'all' | 'completed';
  reviewerId?: string;
  reviewers: Array<{ id: string; name: string | null; email: string }>;
  sort: ReviewSort;
}

export function ReviewFilters({ show, reviewerId, reviewers, sort }: ReviewFiltersProps) {
  const { updateParam, isPending } = useUrlParams();

  const handleShowChange = (value: string) => {
    // Remove the filter if it's the default value
    if (value === 'needsAttention') {
      updateParam('show', null);
    } else {
      updateParam('show', value);
    }
  };

  const handleReviewerChange = (value: string) => {
    // Remove the filter if it's the default value
    if (value === 'all-reviewers') {
      updateParam('reviewerId', null);
    } else {
      updateParam('reviewerId', value);
    }
  };

  const handleSortChange = (value: string) => {
    // Remove the parameter if it's the default value
    updateParam('sort', value === 'date' ? null : value);
  };

  return (
    <>
      <div className="w-full md:w-64">
        <Label htmlFor="show-filter" className="text-sm font-medium mb-2 block">
          Show
        </Label>
        <Select value={show} onValueChange={handleShowChange} disabled={isPending}>
          <SelectTrigger id="show-filter" disabled={isPending}>
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="needsAttention">Needs Attention</SelectItem>
            <SelectItem value="all">All Reviews</SelectItem>
            <SelectItem value="completed">Completed Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-64">
        <Label htmlFor="reviewer-filter" className="text-sm font-medium mb-2 block">
          Reviewer
        </Label>
        <Select value={reviewerId || 'all-reviewers'} onValueChange={handleReviewerChange} disabled={isPending}>
          <SelectTrigger id="reviewer-filter" disabled={isPending}>
            <SelectValue placeholder="All reviewers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-reviewers">All reviewers</SelectItem>
            {reviewers.map((reviewer) => (
              <SelectItem key={reviewer.id} value={reviewer.id}>
                {reviewer.name || reviewer.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-64">
        <Label htmlFor="sort-filter" className="text-sm font-medium mb-2 block">
          Sort
        </Label>
        <Select value={sort} onValueChange={handleSortChange} disabled={isPending}>
          <SelectTrigger id="sort-filter" disabled={isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Meeting date, newest first</SelectItem>
            <SelectItem value="longestWait">Longest wait first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending && (
        <div className="flex items-end pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      )}
    </>
  );
}

