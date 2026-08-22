import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TomTomConfig } from "@tomtom-org/maps-sdk/core";
import { TomTomMap } from "@tomtom-org/maps-sdk/map";
import { Marker, setWorkerUrl, type MapMouseEvent } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Facility } from "@/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// Vite's dev server can't resolve MapLibre's worker via import.meta.url on
// its own (a known maplibre-gl v6 + bundler issue) — point it at the
// worker chunk explicitly, once, before any map is constructed.
setWorkerUrl(maplibreWorkerUrl);

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined;

let configured = false;
function ensureConfigured() {
  if (!configured && TOMTOM_KEY) {
    TomTomConfig.instance.put({ apiKey: TOMTOM_KEY });
    configured = true;
  }
}

interface LatLng {
  lat: number;
  lng: number;
}

interface MapViewProps {
  facilities: Facility[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userLocation?: LatLng | null;
  /** When true, clicking the map sets your location instead of doing nothing. */
  pinMode?: boolean;
  onPinLocation?: (loc: LatLng) => void;
}

export function MapView({
  facilities,
  selectedId,
  onSelect,
  userLocation,
  pinMode,
  onPinLocation,
}: MapViewProps) {
  if (TOMTOM_KEY) {
    return (
      <TomTomMapView
        facilities={facilities}
        selectedId={selectedId}
        onSelect={onSelect}
        userLocation={userLocation ?? null}
        pinMode={pinMode}
        onPinLocation={onPinLocation}
      />
    );
  }
  return (
    <PlaceholderMap
      facilities={facilities}
      selectedId={selectedId}
      onSelect={onSelect}
      userLocation={userLocation ?? null}
      pinMode={pinMode}
      onPinLocation={onPinLocation}
    />
  );
}

function createUserLocationElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "flex h-4 w-4 items-center justify-center";
  el.innerHTML = `
    <span class="absolute h-4 w-4 animate-pulse rounded-full bg-teal-deep/30"></span>
    <span class="relative h-2.5 w-2.5 rounded-full bg-teal-deep ring-2 ring-bg-mist"></span>
  `;
  return el;
}

// ---- Real map, loaded only when a TomTom key is configured ----

function TomTomMapView({
  facilities,
  selectedId,
  onSelect,
  userLocation,
  pinMode,
  onPinLocation,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<TomTomMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const userMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureConfigured();
    if (!containerRef.current) return;

    // Center on the first facility only as a fallback for the constructor
    // (which requires *some* starting point) — corrected immediately below
    // once loaded, so the map never sits zoomed into one arbitrary place.
    const map = new TomTomMap({
      container: containerRef.current,
      center: [facilities[0]?.lng ?? 0, facilities[0]?.lat ?? 0],
      zoom: 12,
    });
    mapRef.current = map;
    map.mapLibreMap.on("load", () => {
      setReady(true);
      // Default to showing every facility at once, not just whichever one
      // happened to be first in the list.
      if (facilities.length > 0) {
        const lats = facilities.map((f) => f.lat);
        const lngs = facilities.map((f) => f.lng);
        map.mapLibreMap.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 64, maxZoom: 14, duration: 0 },
        );
      }
    });

    return () => {
      map.mapLibreMap.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    facilities.forEach((f) => {
      const marker = new Marker({ color: "#2F6E68" })
        .setLngLat([f.lng, f.lat])
        .addTo(map.mapLibreMap);
      marker.getElement().addEventListener("click", () => onSelect(f.id));
      markersRef.current[f.id] = marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, facilities]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (userLocation) {
      userMarkerRef.current = new Marker({ element: createUserLocationElement() })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapRef.current.mapLibreMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation]);

  // Pin mode: clicking anywhere on the map sets that point as your
  // location, for when auto-detected (Wi-Fi/IP-based) location is wrong.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current.mapLibreMap;
    if (!pinMode || !onPinLocation) {
      map.getCanvas().style.cursor = "";
      return;
    }
    map.getCanvas().style.cursor = "crosshair";
    function handleClick(e: MapMouseEvent) {
      onPinLocation!({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    }
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      map.getCanvas().style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinMode]);

  // Zoom out to fit every facility marker plus the user's location as soon
  // as it's captured, so the whole picture is visible at once.
  useEffect(() => {
    if (!ready || !userLocation || !mapRef.current || facilities.length === 0) return;
    const lats = [userLocation.lat, ...facilities.map((f) => f.lat)];
    const lngs = [userLocation.lng, ...facilities.map((f) => f.lng)];
    mapRef.current.mapLibreMap.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 64, maxZoom: 15, duration: 900 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation]);

  useEffect(() => {
    if (!ready || !selectedId || !mapRef.current) return;
    const facility = facilities.find((f) => f.id === selectedId);
    if (facility) {
      mapRef.current.mapLibreMap.flyTo({ center: [facility.lng, facility.lat], zoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
}

// ---- Placeholder map, used until a TomTom key is configured ----

function PlaceholderMap({
  facilities,
  selectedId,
  onSelect,
  userLocation,
  pinMode,
  onPinLocation,
}: MapViewProps) {
  const reduced = useReducedMotion();

  const bounds = useMemo(() => {
    const points = userLocation ? [...facilities, userLocation] : facilities;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const pad = 0.02;
    return {
      minLat: Math.min(...lats) - pad,
      maxLat: Math.max(...lats) + pad,
      minLng: Math.min(...lngs) - pad,
      maxLng: Math.max(...lngs) + pad,
    };
  }, [facilities, userLocation]);

  function position(p: LatLng) {
    const x = ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = 100 - ((p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { left: `${x}%`, top: `${y}%` };
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode || !onPinLocation) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    onPinLocation({
      lng: bounds.minLng + (xPct / 100) * (bounds.maxLng - bounds.minLng),
      lat: bounds.maxLat - (yPct / 100) * (bounds.maxLat - bounds.minLat),
    });
  }

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden bg-[#E6E3DA]",
        pinMode ? "cursor-crosshair" : "",
      ].join(" ")}
      onClick={handleContainerClick}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(#DCD8CE 1px, transparent 1px), linear-gradient(90deg, #DCD8CE 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />
      <p className="absolute left-4 top-4 max-w-[220px] font-mono text-[11px] uppercase tracking-[0.1em] text-stone">
        Map preview — connect VITE_TOMTOM_API_KEY for live tiles
      </p>

      {userLocation && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={position(userLocation)}
          aria-label="Your location"
        >
          <span className="absolute -inset-1.5 animate-pulse rounded-full bg-teal-deep/25" />
          <span className="relative block h-2.5 w-2.5 rounded-full bg-teal-deep ring-2 ring-bg-mist" />
        </div>
      )}

      {facilities.map((f, i) => {
        const isSelected = f.id === selectedId;
        return (
          <motion.button
            key={f.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(f.id);
            }}
            className="absolute -translate-x-1/2 -translate-y-full focus-visible:z-10"
            style={position(f)}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, delay: i * 0.06, ease: "easeOut" }}
            aria-label={`${f.name}, ${f.specialty}`}
          >
            <span
              className={[
                "flex h-3 w-3 rounded-full ring-4 transition-all duration-150",
                isSelected
                  ? "bg-clay-alert ring-[#B5502E]/20 scale-125"
                  : "bg-teal-deep ring-[#2F6E68]/15",
              ].join(" ")}
            />
            {isSelected && (
              <span className="absolute left-1/2 top-full mt-1.5 w-max max-w-[160px] -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] text-bg-mist">
                {f.name}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
