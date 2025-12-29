'use client'
import { ReviewProgress } from '@/lib/db/reviews';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, AlertCircle, Clock, Info } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReviewsTableProps {
  reviews: ReviewProgress[];
}

export function ReviewsTable({ reviews }: ReviewsTableProps) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">No meetings need review at this time.</p>
      </div>
    );
  }
  
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>City</TableHead>
            <TableHead>Meeting</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <div className="flex items-center gap-1">
                Progress
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Progress is calculated based on the timestamp of the last user-edited utterance.
                        All utterances up to that point are considered reviewed.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </TableHead>
            <TableHead>Edits</TableHead>
            <TableHead>Primary Reviewer</TableHead>
            <TableHead>Last Activity</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => (
            <TableRow key={`${review.cityId}-${review.meetingId}`}>
              <TableCell className="font-medium">{review.cityName}</TableCell>
              
              <TableCell>
                <div>
                  <div className="font-medium">{review.meetingName}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(review.meetingDate).toLocaleDateString()}
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                {review.status === 'needsReview' ? (
                  <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                    <AlertCircle className="h-3 w-3" />
                    Needs Review
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                    <Clock className="h-3 w-3" />
                    In Progress
                  </Badge>
                )}
              </TableCell>
              
              <TableCell>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Progress value={review.progressPercentage} className="w-24" />
                    <span className="text-sm text-muted-foreground">
                      {review.progressPercentage}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {review.reviewedUtterances} / {review.totalUtterances} reviewed
                  </div>
                </div>
              </TableCell>
              
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">
                        <div className="text-sm">
                          <span className="font-medium text-blue-600">
                            {review.userEditedUtterances}
                          </span>
                          {' '}manual
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-green-600">
                            {review.taskEditedUtterances}
                          </span>
                          {' '}automated
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-1">
                        <p><strong>Manual edits:</strong> Changes made by human reviewers</p>
                        <p><strong>Automated edits:</strong> Fixes applied by fixTranscript task</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              
              <TableCell>
                {review.primaryReviewer ? (
                  <div>
                    <div className="text-sm font-medium">
                      {review.primaryReviewer.userName || review.primaryReviewer.userEmail}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {review.primaryReviewer.editCount} edit{review.primaryReviewer.editCount !== 1 ? 's' : ''}
                    </div>
                    {review.reviewers.length > 1 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-xs text-muted-foreground cursor-help">
                              +{review.reviewers.length - 1} other{review.reviewers.length > 2 ? 's' : ''}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-1">
                              {review.reviewers.slice(1).map(r => (
                                <div key={r.userId}>
                                  {r.userName || r.userEmail}: {r.editCount} edit{r.editCount !== 1 ? 's' : ''}
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">No edits yet</span>
                )}
              </TableCell>
              
              <TableCell>
                {review.lastEditAt ? (
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(review.lastEditAt), { addSuffix: true })}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Never</span>
                )}
              </TableCell>
              
              <TableCell className="text-right">
                <Link href={`/${review.cityId}/${review.meetingId}/transcript`}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Review
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

