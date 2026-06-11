"use client";

import dynamic from "next/dynamic";

// Loaded client-side only — server-rendering it triggers canvas-related issues.
// `dynamic({ ssr: false })` is not allowed in Server Components on Next 15+,
// so the dynamic call is wrapped in this thin client boundary.
const Aurora = dynamic(() => import("@/components/landing/aurora"), { ssr: false });

export default Aurora;
