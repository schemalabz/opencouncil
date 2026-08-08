"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocationPoint } from "../types";

export interface MapFocus {
  lng: number;
  lat: number;
  zoom?: number;
}

interface Props {
  token: string | undefined;
  points: LocationPoint[];
  focus?: MapFocus | null;
  className?: string;
}

const GREECE: [number, number] = [23.9, 38.4];

/**
 * The full-height map canvas. Starts over the whole country, flies to a
 * municipality when one is picked, and keeps every picked address pinned.
 */
export function LocationsMap({ token, points, focus, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!token || !container.current || map.current) return;
    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: GREECE,
      zoom: 5.6,
      attributionControl: false,
    });
    // Track container size changes (breakpoint shifts, HMR, panel resizes) —
    // mapbox only auto-resizes on window resize events.
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (map.current && focus) {
      map.current.flyTo({
        center: [focus.lng, focus.lat],
        zoom: focus.zoom ?? 11.5,
        duration: 2200,
        essential: true,
      });
    }
  }, [focus]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const geocoded = points.filter((p) => p.lng !== 0 || p.lat !== 0);
    for (const p of geocoded) {
      const el = document.createElement("div");
      el.className = "notis-pin";
      el.title = p.text;
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(m);
      markers.current.push(marker);
    }
    if (geocoded.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      geocoded.forEach((p) => bounds.extend([p.lng, p.lat]));
      m.fitBounds(bounds, { padding: 96, maxZoom: 14, duration: 1400 });
    } else if (geocoded.length === 1) {
      m.easeTo({ center: [geocoded[0].lng, geocoded[0].lat], zoom: 13, duration: 1400 });
    }
  }, [points]);

  if (!token) {
    return (
      <div
        className={`flex items-center justify-center bg-secondary text-xs text-muted-foreground ${className ?? ""}`}
      >
        Χωρίς NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN — ο χάρτης είναι απενεργοποιημένος.
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* explicit h/w: mapbox-gl.css forces position:relative on the container,
          which would zero out an inset-based size */}
      <div ref={container} className="absolute inset-0 h-full w-full" />
      {/* soft paper edge where the sheet meets the map */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
      <style>{`
        .notis-pin {
          width: 14px; height: 14px;
          background: hsl(24 100% 50%);
          border: 2.5px solid #fff;
          border-radius: 9999px 9999px 9999px 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 6px rgba(0,0,0,.25);
          animation: notis-pin-drop .45s cubic-bezier(.16,1,.3,1);
        }
        @keyframes notis-pin-drop {
          from { transform: rotate(-45deg) translate(14px,-14px); opacity: 0; }
          to   { transform: rotate(-45deg) translate(0,0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
