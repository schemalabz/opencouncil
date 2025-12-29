import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function ReviewsLoading() {
  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-64">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="w-full md:w-64">
          <Skeleton className="h-4 w-28 mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      {/* Table */}
      <Card className="border rounded-lg">
        <div className="p-4">
          {/* Table Header */}
          <div className="grid grid-cols-9 gap-4 mb-4 pb-4 border-b">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Table Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-9 gap-4 py-4 border-b last:border-b-0">
              <Skeleton className="h-5 w-20" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-24" />
              <div className="space-y-1">
                <Skeleton className="h-2 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

