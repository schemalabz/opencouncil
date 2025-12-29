"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

interface ReviewFiltersProps {
  show: 'needsAttention' | 'all' | 'completed';
  reviewerId?: string;
  reviewers: Array<{ id: string; name: string | null; email: string }>;
}

export function ReviewFilters({ show, reviewerId, reviewers }: ReviewFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    
    if (value === 'all-reviewers' || value === 'needsAttention') {
      // Remove the filter if it's the default value
      params.delete(key);
    } else {
      params.set(key, value);
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleShowChange = (value: string) => {
    updateFilter('show', value);
  };

  const handleReviewerChange = (value: string) => {
    updateFilter('reviewerId', value);
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
          Primary Reviewer
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

