"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Custom hook for updating URL search parameters
 * Provides a consistent way to update URL params with loading state
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return {
    updateParam,
    isPending,
    searchParams
  };
}

