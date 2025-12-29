'use client'
import { useState } from 'react';
import { ReviewProgress } from '@/lib/db/reviews';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDistanceToNow, formatDistance, format as formatDate } from 'date-fns';
import { formatDurationMs } from '@/lib/formatters/time';
import { ExternalLink, AlertCircle, Clock, Info, Timer, Eye } from 'lucide-react';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ReviewSessionsBreakdown } from './ReviewSessionsBreakdown';

interface ReviewsTableProps {
  reviews: ReviewProgress[];
}

export function ReviewsTable({ reviews }: ReviewsTableProps) {
  const [selectedReview, setSelectedReview] = useState<ReviewProgress | null>(null);
  
  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">No meetings need review at this time.</p>
      </div>
    );
  }
  
  return (
    <>
    <Sheet open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
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
            <TableHead>
              <div className="flex items-center gap-1">
                Review Time
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        Estimated time spent by primary reviewer. Calculated from edit patterns
                        and utterance durations, excluding breaks longer than 10 minutes.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </TableHead>
            <TableHead>Last Activity</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => {
            return (
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
                {review.estimatedReviewTimeMs > 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Timer className="h-3 w-3 text-purple-600" />
                            {formatDurationMs(review.estimatedReviewTimeMs)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {review.reviewSessions} session{review.reviewSessions !== 1 ? 's' : ''}
                            {review.reviewEfficiency !== null && (
                              <span className="ml-1">
                                • 1:{review.reviewEfficiency.toFixed(1)} ratio
                              </span>
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p><strong>Estimated review time</strong></p>
                          <p>Based on edit patterns and utterance durations</p>
                          <p>Excludes breaks longer than 10 minutes</p>
                          {review.meetingDurationMs > 0 && (
                            <>
                              <p className="mt-2 pt-2 border-t">
                                <strong>Meeting duration:</strong> {formatDurationMs(review.meetingDurationMs)}
                              </p>
                              {review.reviewEfficiency !== null && (
                                <p>
                                  <strong>Efficiency:</strong> 1:{review.reviewEfficiency.toFixed(1)}
                                </p>
                              )}
                            </>
                          )}
                          {review.firstEditAt && review.lastEditAt && (
                            <p className="mt-2 pt-2 border-t">
                              <strong>Calendar span:</strong> {formatDate(new Date(review.firstEditAt), 'MMM d, h:mm a')} - {formatDate(new Date(review.lastEditAt), 'MMM d, h:mm a')}
                              <br />
                              <span className="text-muted-foreground">
                                ({formatDistance(new Date(review.firstEditAt), new Date(review.lastEditAt))})
                              </span>
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedReview(review)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Details
                  </Button>
              </TableCell>
            </TableRow>
          );
          })}
        </TableBody>
      </Table>
    </div>
    
    {/* Sheet for detailed review information */}
    {selectedReview && (
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review Details</SheetTitle>
          <SheetDescription>
            {selectedReview.cityName} - {selectedReview.meetingName}
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6">
          {/* Overview Section */}
          <div className="space-y-4 mb-6 pb-6 border-b">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Meeting Date</div>
                <div className="font-medium">{new Date(selectedReview.meetingDate).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Status</div>
                <div>
                  {selectedReview.status === 'needsReview' ? (
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
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Progress</div>
                <div className="flex items-center gap-2">
                  <Progress value={selectedReview.progressPercentage} className="w-24" />
                  <span className="text-sm">{selectedReview.progressPercentage}%</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedReview.reviewedUtterances} / {selectedReview.totalUtterances} reviewed
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Edits</div>
                <div className="text-sm">
                  <span className="font-medium text-blue-600">{selectedReview.userEditedUtterances}</span> manual
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-green-600">{selectedReview.taskEditedUtterances}</span> automated
                </div>
              </div>
            </div>
            
            {/* Reviewers */}
            {selectedReview.reviewers.length > 0 && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">Reviewers</div>
                <div className="space-y-2">
                  {selectedReview.reviewers.map((reviewer) => (
                    <div key={reviewer.userId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{reviewer.userName || reviewer.userEmail}</span>
                        {selectedReview.primaryReviewer?.userId === reviewer.userId && (
                          <Badge variant="default" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {reviewer.editCount} edit{reviewer.editCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Unified Timeline */}
          <ReviewSessionsBreakdown
            sessions={selectedReview.unifiedReviewSessions}
            totalReviewTimeMs={selectedReview.estimatedReviewTimeMs}
            meetingDurationMs={selectedReview.meetingDurationMs}
            reviewEfficiency={selectedReview.reviewEfficiency}
          />
          
          {/* Action Button */}
          <div className="mt-6 pt-6 border-t">
            <Link href={`/${selectedReview.cityId}/${selectedReview.meetingId}/transcript`}>
              <Button className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Go to Transcript Review
              </Button>
            </Link>
          </div>
        </div>
      </SheetContent>
    )}
  </Sheet>
    </>
  );
}

