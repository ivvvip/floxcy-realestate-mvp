'use client';

/**
 * FloxcyMap — Leaflet + CartoDB Dark Matter (free) + OpenStreetMap data.
 *
 * Three intended call sites:
 *  1. /map (full-screen Dubai map with both layers + toggles + search)
 *  2. /areas/[id] mini-map (single area polygon + buildings inside it)
 *  3. /buildings (toggleable map view of the 504 verified buildings)
 *
 * Leaflet hits `window` at import time, so the file is "use client" AND
 * the consumer must wrap the import in dynamic({ ssr: false }) so it
 * never gets server-rendered. See /map/page.tsx for the pattern.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapAreaItem, MapBuildingItem } from '@/lib/types';

// Dubai centre + reasonable default zoom
const DUBAI_CENTER: [number, number] = [25.2048, 55.2708];
const DEFAULT_ZOOM = 11;

// CartoDB Dark Matter — free, no API key, OSM-derived tiles.
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>';

// Yield → color mapping. Tones picked to match the rest of the dashboard.
function yieldColor(y: number | null | undefined): string {
  if (y == null) return '#6B7280';
  if (y >= 9) return '#00D4AA';
  if (y >= 7) return '#10B981';
  if (y >= 5) return '#F59E0B';
  return '#6B7280';
}

const CATEGORY_TONE: Record<string, { fill: string; ring: string; label: string }> = {
  apartment: { fill: '#3B82F6', ring: '#1D4ED8', label: 'Apartment' },
  villa: { fill: '#10B981', ring: '#065F46', label: 'Villa' },
  hotel_apt: { fill: '#8B5CF6', ring: '#5B21B6', label: 'Hotel apartment' },
  office: { fill: '#F59E0B', ring: '#92400E', label: 'Office' },
  retail: { fill: '#F59E0B', ring: '#92400E', label: 'Retail' },
  warehouse: { fill: '#F59E0B', ring: '#92400E', label: 'Warehouse' },
  labor_camp: { fill: '#6B7280', ring: '#374151', label: 'Labor camp' },
  whole_building: { fill: '#6B7280', ring: '#374151', label: 'Whole building' },
  other: { fill: '#6B7280', ring: '#374151', label: 'Other' },
};
function categoryTone(cat: string | null | undefined) {
  if (!cat) return CATEGORY_TONE.other;
  return CATEGORY_TONE[cat] ?? CATEGORY_TONE.other;
}

interface Props {
  areas?: MapAreaItem[];
  buildings?: MapBuildingItem[];
  // Initial layer visibility
  showAreasInitially?: boolean;
  showBuildingsInitially?: boolean;
  showLayerControl?: boolean;
  showSearch?: boolean;
  // For mini-map embeds: lock pan/zoom and frame on a single area or a list
  // of points. center + zoom + scrollWheelZoom only fire on first mount —
  // edits don't re-frame.
  center?: [number, number];
  zoom?: number;
  scrollWheelZoom?: boolean;
  // Fit-to-bounds when a `fitBounds` array is supplied (LatLng pairs)
  fitBounds?: [number, number][];
  // For navigation popups
  areaHrefBase?: string; // default '/areas'
  buildingHrefBase?: string; // default '/buildings'
  // Visual sizing
  className?: string;
  heightClass?: string; // default 'h-[600px]'
}

export default function FloxcyMap({
  areas = [],
  buildings = [],
  showAreasInitially = true,
  showBuildingsInitially = true,
  showLayerControl = true,
  showSearch = true,
  center = DUBAI_CENTER,
  zoom = DEFAULT_ZOOM,
  scrollWheelZoom = true,
  fitBounds,
  areaHrefBase = '/areas',
  buildingHrefBase = '/buildings',
  className,
  heightClass = 'h-[600px]',
}: Props) {
  const [showAreas, setShowAreas] = useState(showAreasInitially);
  const [showBuildings, setShowBuildings] = useState(showBuildingsInitially);
  const [search, setSearch] = useState('');

  // Filter both layers by case-insensitive substring on name
  const q = search.trim().toLowerCase();
  const visibleAreas = useMemo(() => {
    if (!q) return areas;
    return areas.filter((a) => a.name.toLowerCase().includes(q));
  }, [areas, q]);
  const visibleBuildings = useMemo(() => {
    if (!q) return buildings;
    return buildings.filter((b) => b.name.toLowerCase().includes(q));
  }, [buildings, q]);

  return (
    <div className={['relative', heightClass, className].filter(Boolean).join(' ')}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className="h-full w-full rounded-lg overflow-hidden"
        // The dark tiles already supply attribution via TileLayer
        attributionControl={true}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains={['a','b','c','d']} />
        {fitBounds && fitBounds.length >= 1 && <FitBounds points={fitBounds} />}

        {/* Layer 1 — area polygons (or centroid circles when no polygon) */}
        {showAreas && visibleAreas.map((a) => {
          const color = yieldColor(a.yield_pct);
          // GeoJSON layer for areas with polygons
          if (a.polygon) {
            return (
              <GeoJSON
                key={`poly:${a.slug}`}
                data={a.polygon as GeoJSON.GeoJsonObject}
                style={{
                  color,
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.25,
                }}
              >
                <Popup>{renderAreaPopup(a, areaHrefBase)}</Popup>
              </GeoJSON>
            );
          }
          // Fallback: centroid circle for areas without a polygon
          if (a.lat != null && a.lon != null) {
            return (
              <CircleMarker
                key={`pt:${a.slug}`}
                center={[a.lat, a.lon]}
                radius={6}
                pathOptions={{
                  color, fillColor: color, fillOpacity: 0.6, weight: 1.5,
                }}
              >
                <Popup>{renderAreaPopup(a, areaHrefBase)}</Popup>
              </CircleMarker>
            );
          }
          return null;
        })}

        {/* Layer 2 — verified buildings as colored circle markers */}
        {showBuildings && visibleBuildings.map((b) => {
          const tone = categoryTone(b.category);
          return (
            <CircleMarker
              key={`b:${b.id}`}
              center={[b.lat, b.lon]}
              radius={5}
              pathOptions={{
                color: tone.ring,
                fillColor: tone.fill,
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Popup>{renderBuildingPopup(b, buildingHrefBase, tone.label)}</Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Floating controls — layer toggles + search */}
      {(showLayerControl || showSearch) && (
        <div className="absolute right-3 top-3 z-[400] flex flex-col gap-2">
          {showLayerControl && (
            <div className="rounded-md border border-border bg-bg-card/95 backdrop-blur px-2 py-1.5 shadow-md text-xs flex items-center gap-1">
              <ToggleChip on={showAreas} onToggle={() => setShowAreas((v) => !v)}>
                Areas
              </ToggleChip>
              <ToggleChip on={showBuildings} onToggle={() => setShowBuildings((v) => !v)}>
                Buildings
              </ToggleChip>
            </div>
          )}
          {showSearch && (
            <input
              type="search"
              placeholder="Search area or building…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-border bg-bg-card/95 backdrop-blur px-2 py-1.5 shadow-md text-xs text-fg placeholder:text-fg-subtle min-w-[200px] focus:outline-none focus:border-accent"
            />
          )}
        </div>
      )}

      {/* Legend — bottom left */}
      <div className="absolute left-3 bottom-3 z-[400] rounded-md border border-border bg-bg-card/95 backdrop-blur px-3 py-2 shadow-md text-[10px] text-fg-muted leading-tight">
        <div className="font-semibold text-fg mb-1">Yield (areas)</div>
        <LegendRow color="#00D4AA" label="≥ 9%" />
        <LegendRow color="#10B981" label="7–9%" />
        <LegendRow color="#F59E0B" label="5–7%" />
        <LegendRow color="#6B7280" label="< 5%" />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Small helpers

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    fitted.current = true;
  }, [map, points]);
  return null;
}

function ToggleChip({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
        on
          ? 'bg-accent/15 text-accent'
          : 'text-fg-muted hover:text-fg',
      ].join(' ')}
    >
      <span aria-hidden>{on ? '●' : '○'}</span>
      {children}
    </button>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function renderAreaPopup(a: MapAreaItem, areaHrefBase: string) {
  return (
    <div className="text-[12px]">
      <div className="font-semibold text-fg">{a.name}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-fg-muted">
        {a.yield_pct != null && (
          <>
            <span>Yield</span>
            <span className="text-right tabular text-fg">
              {a.yield_pct.toFixed(2)}%
            </span>
          </>
        )}
        {a.avg_ppsf != null && (
          <>
            <span>Avg PPSF</span>
            <span className="text-right tabular text-fg">
              AED {Math.round(a.avg_ppsf).toLocaleString()}
            </span>
          </>
        )}
        {a.transaction_count != null && (
          <>
            <span>Sales</span>
            <span className="text-right tabular text-fg">
              {a.transaction_count.toLocaleString()}
            </span>
          </>
        )}
      </div>
      <a
        href={`${areaHrefBase}/${a.slug}`}
        className="mt-2 inline-block text-accent font-medium"
      >
        View Details →
      </a>
    </div>
  );
}

function renderBuildingPopup(
  b: MapBuildingItem,
  buildingHrefBase: string,
  categoryLabel: string,
) {
  return (
    <div className="text-[12px]">
      <div className="font-semibold text-fg">{b.name}</div>
      <div className="mt-0.5 text-fg-subtle text-[11px]">
        {categoryLabel}
        {b.area_name ? ` · ${b.area_name}` : ''}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-fg-muted">
        <span>Active rents</span>
        <span className="text-right tabular text-fg">
          {b.contract_count.toLocaleString()}
        </span>
        {b.avg_annual_rent != null && (
          <>
            <span>Avg rent/yr</span>
            <span className="text-right tabular text-fg">
              AED {Math.round(b.avg_annual_rent).toLocaleString()}
            </span>
          </>
        )}
      </div>
      <a
        href={`${buildingHrefBase}/${b.id}`}
        className="mt-2 inline-block text-accent font-medium"
      >
        Building X-Ray →
      </a>
    </div>
  );
}
