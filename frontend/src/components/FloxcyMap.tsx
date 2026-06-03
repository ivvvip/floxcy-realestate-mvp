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
 *
 * Popups are bound via Leaflet's `bindPopup` with HTML strings instead of
 * React JSX-as-children. react-leaflet 4 silently drops `<Popup>` children
 * passed to `<GeoJSON>`, so an HTML-string popup that we wire on every
 * marker/polygon is the only pattern that works for both layer types.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapAreaItem, MapBuildingItem } from '@/lib/types';

const DUBAI_CENTER: [number, number] = [25.2048, 55.2708];
const DEFAULT_ZOOM = 11;

const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>';

function yieldColor(y: number | null | undefined): string {
  if (y == null) return '#6B7280';
  if (y >= 9) return '#00D4AA';
  if (y >= 7) return '#10B981';
  if (y >= 5) return '#F59E0B';
  return '#6B7280';
}

const CATEGORY_TONE: Record<
  string,
  { fill: string; ring: string; label: string; emoji: string }
> = {
  apartment: { fill: '#3B82F6', ring: '#1D4ED8', label: 'Apartment', emoji: '🏢' },
  villa: { fill: '#10B981', ring: '#065F46', label: 'Villa', emoji: '🏠' },
  hotel_apt: { fill: '#8B5CF6', ring: '#5B21B6', label: 'Hotel apartment', emoji: '🏨' },
  office: { fill: '#F59E0B', ring: '#92400E', label: 'Office', emoji: '🏬' },
  retail: { fill: '#F59E0B', ring: '#92400E', label: 'Retail', emoji: '🛍️' },
  warehouse: { fill: '#F59E0B', ring: '#92400E', label: 'Warehouse', emoji: '🏭' },
  labor_camp: { fill: '#6B7280', ring: '#374151', label: 'Labor camp', emoji: '⛺' },
  whole_building: { fill: '#6B7280', ring: '#374151', label: 'Whole building', emoji: '🏬' },
  other: { fill: '#6B7280', ring: '#374151', label: 'Property', emoji: '🏢' },
};
function categoryTone(cat: string | null | undefined) {
  if (!cat) return CATEGORY_TONE.other;
  return CATEGORY_TONE[cat] ?? CATEGORY_TONE.other;
}

// HTML-escape user-supplied strings before interpolating into the popup
// string. Building/area names are DLD-sourced and clean, but we still
// guard against any stray angle-bracket / ampersand input.
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function fmtAED(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `AED ${Math.round(n).toLocaleString()}`;
}

function googleMapsQuery(...parts: (string | null | undefined)[]): string {
  const q = parts.filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function buildBuildingPopupHtml(
  b: MapBuildingItem,
  buildingHrefBase: string,
): string {
  const tone = categoryTone(b.category);
  const mapsHref = googleMapsQuery(b.name, b.area_name, 'Dubai');
  return `
    <div style="font-family:inherit;font-size:12px;min-width:220px;line-height:1.4;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
        <span aria-hidden style="font-size:14px;">${tone.emoji}</span>
        <strong style="color:#fff;">${esc(b.name)}</strong>
      </div>
      <div style="color:#9CA3AF;font-size:11px;margin-bottom:6px;">
        <span style="display:inline-block;background:${tone.fill}22;color:${tone.fill};
                     padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;
                     text-transform:uppercase;letter-spacing:0.04em;margin-right:6px;">
          ${esc(tone.label)}
        </span>
        ${b.area_name ? esc(b.area_name) : ''}
      </div>
      <div style="color:#9CA3AF;">
        🏠 <strong style="color:#fff;">${fmtNum(b.contract_count)}</strong> active rent contracts
      </div>
      ${
        b.avg_annual_rent != null
          ? `<div style="color:#9CA3AF;margin-top:2px;">💰 Avg rent: <strong style="color:#fff;">${fmtAED(b.avg_annual_rent)}</strong>/yr</div>`
          : ''
      }
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
        <a href="${buildingHrefBase}/${esc(b.id)}"
           style="color:#00D4AA;font-weight:600;text-decoration:none;">
          Building X-Ray →
        </a>
        <a href="${mapsHref}" target="_blank" rel="noreferrer"
           style="color:#9CA3AF;font-weight:500;text-decoration:none;">
          Google Maps ↗
        </a>
      </div>
    </div>
  `;
}

function buildAreaPopupHtml(
  a: MapAreaItem,
  areaHrefBase: string,
): string {
  const color = yieldColor(a.yield_pct);
  const yieldLabel =
    a.yield_pct == null
      ? '—'
      : a.yield_pct >= 9
        ? 'Premium yield'
        : a.yield_pct >= 7
          ? 'Strong yield'
          : a.yield_pct >= 5
            ? 'Moderate yield'
            : 'Low yield';
  return `
    <div style="font-family:inherit;font-size:12px;min-width:220px;line-height:1.4;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <strong style="color:#fff;">${esc(a.name)}</strong>
        ${
          a.yield_pct != null
            ? `<span style="background:${color}22;color:${color};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">
                 ${yieldLabel}
               </span>`
            : ''
        }
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;color:#9CA3AF;">
        ${
          a.yield_pct != null
            ? `<span>Yield</span><span style="color:#fff;text-align:right;font-variant-numeric:tabular-nums;">${a.yield_pct.toFixed(2)}%</span>`
            : ''
        }
        ${
          a.avg_ppsf != null
            ? `<span>Avg PPSF</span><span style="color:#fff;text-align:right;font-variant-numeric:tabular-nums;">AED ${Math.round(a.avg_ppsf).toLocaleString()}</span>`
            : ''
        }
        ${
          a.transaction_count != null
            ? `<span>Sales</span><span style="color:#fff;text-align:right;font-variant-numeric:tabular-nums;">${a.transaction_count.toLocaleString()}</span>`
            : ''
        }
      </div>
      <div style="margin-top:8px;">
        <a href="${areaHrefBase}/${esc(a.slug)}"
           style="color:#00D4AA;font-weight:600;text-decoration:none;">
          View Area →
        </a>
      </div>
    </div>
  `;
}

interface Props {
  areas?: MapAreaItem[];
  buildings?: MapBuildingItem[];
  showAreasInitially?: boolean;
  showBuildingsInitially?: boolean;
  showLayerControl?: boolean;
  showSearch?: boolean;
  center?: [number, number];
  zoom?: number;
  scrollWheelZoom?: boolean;
  fitBounds?: [number, number][];
  areaHrefBase?: string;
  buildingHrefBase?: string;
  className?: string;
  heightClass?: string;
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
        attributionControl={true}
      >
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          subdomains={['a', 'b', 'c', 'd']}
        />
        {fitBounds && fitBounds.length >= 1 && <FitBounds points={fitBounds} />}

        {showAreas && visibleAreas.map((a) => {
          const color = yieldColor(a.yield_pct);
          const popupHtml = buildAreaPopupHtml(a, areaHrefBase);
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
                eventHandlers={{
                  add: (e) => {
                    // Bind popup to every sub-layer the GeoJSON renders.
                    (e.target as L.GeoJSON).eachLayer((sub) => {
                      sub.bindPopup(popupHtml, { className: 'floxcy-popup' });
                    });
                  },
                }}
              />
            );
          }
          if (a.lat != null && a.lon != null) {
            return (
              <CircleMarker
                key={`pt:${a.slug}`}
                center={[a.lat, a.lon]}
                radius={6}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.6,
                  weight: 1.5,
                }}
                eventHandlers={{
                  add: (e) => {
                    (e.target as L.CircleMarker).bindPopup(popupHtml, {
                      className: 'floxcy-popup',
                    });
                  },
                }}
              />
            );
          }
          return null;
        })}

        {showBuildings && visibleBuildings.map((b) => {
          const tone = categoryTone(b.category);
          const popupHtml = buildBuildingPopupHtml(b, buildingHrefBase);
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
              eventHandlers={{
                add: (e) => {
                  (e.target as L.CircleMarker).bindPopup(popupHtml, {
                    className: 'floxcy-popup',
                  });
                },
              }}
            />
          );
        })}
      </MapContainer>

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
        on ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg',
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
