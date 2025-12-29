import { getReviewStats } from '@/lib/db/reviews';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export async function ReviewsOverviewWidget() {
  const stats = await getReviewStats();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcript Reviews</CardTitle>
        <CardDescription>Track human review progress across all meetings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="flex flex-col items-center p-4 border rounded-lg">
            <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
            <div className="text-2xl font-bold">{stats.needsReview}</div>
            <div className="text-sm text-muted-foreground">Needs Review</div>
          </div>
          
          <div className="flex flex-col items-center p-4 border rounded-lg">
            <Clock className="h-8 w-8 text-yellow-500 mb-2" />
            <div className="text-2xl font-bold">{stats.inProgress}</div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </div>
          
          <div className="flex flex-col items-center p-4 border rounded-lg">
            <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
            <div className="text-2xl font-bold">{stats.completedToday}</div>
            <div className="text-sm text-muted-foreground">Done Today</div>
          </div>
          
          <div className="flex flex-col items-center p-4 border rounded-lg">
            <CheckCircle2 className="h-8 w-8 text-blue-500 mb-2" />
            <div className="text-2xl font-bold">{stats.completedThisWeek}</div>
            <div className="text-sm text-muted-foreground">Done This Week</div>
          </div>
        </div>
        
        <Link href="/admin/reviews">
          <Button className="w-full">View All Reviews</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

