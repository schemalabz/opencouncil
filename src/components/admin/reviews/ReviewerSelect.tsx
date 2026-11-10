'use client'
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { setMeetingReviewer } from '@/lib/actions/reviews';
import type { ReviewListItem } from '@/lib/db/reviews';
import type { ReviewerUser } from '@/lib/db/meetingReviewers';

const UNASSIGNED = 'unassigned';

interface ReviewerSelectProps {
  review: ReviewListItem;
  superAdmins: ReviewerUser[];
}

function displayName(user: { name: string | null; email: string }) {
  return user.name || user.email;
}

function editCountLabel(count: number) {
  return `${count} edit${count !== 1 ? 's' : ''}`;
}

/**
 * The reviewer of a row, the same person that the reviewer filter matches:
 * the assigned superadmin, else the primary reviewer (most edits) in muted
 * text. Hovering lists the other people who edited the transcript. The
 * dropdown turns amber when anyone besides the assigned person edited,
 * because one owner per meeting is the point of the assignment.
 */
export function ReviewerSelect({ review, superAdmins }: ReviewerSelectProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { assignedReviewer, primaryReviewer } = review;

  const shownReviewerId = assignedReviewer?.id ?? primaryReviewer?.userId;
  const otherEditors = review.reviewers.filter(r => r.userId !== shownReviewerId);
  const warn = !!assignedReviewer && otherEditors.length > 0;

  const handleChange = (value: string) => {
    const userId = value === UNASSIGNED ? null : value;
    startTransition(async () => {
      try {
        await setMeetingReviewer(review.cityId, review.meetingId, userId);
        router.refresh();
      } catch (error) {
        console.error('Failed to assign the reviewer:', error);
        toast({
          title: 'Reviewer not saved',
          description: 'The assignment did not save. Try again.',
          variant: 'destructive',
        });
      }
    });
  };

  const triggerTone = warn
    ? 'border-amber-500 font-medium text-amber-700 dark:border-amber-600 dark:text-amber-500'
    : assignedReviewer
      ? 'font-medium'
      : 'text-muted-foreground';

  const select = (
    <Select
      value={assignedReviewer?.id ?? UNASSIGNED}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger className={`h-8 w-full text-sm ${triggerTone}`}>
        {/* !flex: the trigger's [&>span]:line-clamp-1 would stack the icon over the name.
            SelectValue drops className, so the truncation targets its span from here. */}
        <span className="!flex min-w-0 items-center gap-1.5 [&>span]:truncate">
          {warn && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-label="Others also edited" />}
          <SelectValue>
            {assignedReviewer
              ? displayName(assignedReviewer)
              : primaryReviewer
                ? primaryReviewer.userName || primaryReviewer.userEmail
                : 'Unassigned'}
          </SelectValue>
          {/* Outside the truncated span, so a long name never hides it. */}
          {!assignedReviewer && primaryReviewer && (
            <small className="shrink-0 text-xs">by edits</small>
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {superAdmins.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            {displayName(user)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (otherEditors.length === 0) {
    return select;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{select}</div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p className="font-medium">Also edited by:</p>
            {otherEditors.map(r => (
              <p key={r.userId}>
                {r.userName || r.userEmail}: {editCountLabel(r.editCount)}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
