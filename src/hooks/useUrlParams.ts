"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Custom hook for updating URL search parameters.
 * Accepts an optional `hash` that is appended to every URL update,
 * keeping the viewport anchored to a specific section across param changes.
 */
export function useUrlParams(hash?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const buildUrl = (params: URLSearchParams) => {
    const qs = params.toString();
    const base = qs ? `${pathname}?${qs}` : pathname;
    return hash ? `${base}#${hash}` : base;
  };

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);

    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    startTransition(() => {
      router.push(buildUrl(params));
    });
  };

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.push(buildUrl(params));
    });
  };

  return {
    updateParam,
    updateParams,
    isPending,
    searchParams
  };
}
