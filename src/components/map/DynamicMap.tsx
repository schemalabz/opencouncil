'use client';
import dynamic from 'next/dynamic';

// Lazy-loaded map: mapbox-gl (~450KB) stays out of the initial chunk of every
// page that renders (or may never render) a map. `ssr: false` because mapbox
// is canvas/WebGL-only anyway. The placeholder fills the parent container so
// already-sized layouts don't shift while the chunk loads.
const DynamicMap = dynamic(() => import('./map'), {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-muted/30" />,
});

export default DynamicMap;
