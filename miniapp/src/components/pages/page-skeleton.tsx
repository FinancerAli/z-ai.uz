"use client";

import { Skeleton } from "@/components/ui/skeleton";

// Lightweight fallback shown while a dynamically-imported page chunk is
// being downloaded. Keeps layout stable to avoid CLS.
export function PageSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

export default PageSkeleton;
