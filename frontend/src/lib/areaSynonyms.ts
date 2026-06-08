/**
 * Marketing-name → DLD-area synonyms for the shared AreaSelector.
 *
 * DLD stores areas under official cadastral / community names (e.g.
 * "Burj Khalifa", "Marsa Dubai", "Madinat Dubai Almelaheyah"). Investors
 * and users search by the MARKETING name they see on signs and listings
 * ("Downtown", "Dubai Marina", "Maritime City"). Without this map, typing
 * "Downtown" in the dropdown filter returns nothing even though the data
 * is fully present under "Burj Khalifa".
 *
 * Keyed by the option's `name_norm` (lowercase DLD area name — see
 * rent-check/page.tsx where name_norm = area_name_upper.toLowerCase()).
 * Every key here was verified to exist in the live canonical-areas set
 * (api.floxcy.com/api/v1/dld/canonical-areas) on 2026-06-08.
 *
 * Source of truth for the mappings: docs/area-alias-table.csv (high-
 * confidence entries where the marketing name differs from the DLD
 * display name — plain substring search already covers the rest).
 *
 * NOTE on resolution layers: the backend's app/data/dld_area_aliases.py
 * handles community→admin-sector EXPANSION for building roll-ups. This
 * file is the complementary frontend SEARCH layer — it does not change
 * any query, only what the dropdown matches and displays.
 */

// name_norm  →  marketing aliases users might type
export const AREA_SYNONYMS: Record<string, string[]> = {
  'burj khalifa': ['downtown', 'downtown dubai'],
  'madinat al mataar': ['expo city', 'expo 2020'],
  'jumeirah lakes towers': ['jlt'],
  'marsa dubai': ['marina', 'dubai marina'],
  'madinat dubai almelaheyah': ['maritime city', 'dubai maritime city'],
  'jumeirah village circle': ['jvc'],
  'jumeirah village triangle': ['jvt'],
  'jumeirah beach residence': ['jbr'],
  'sobha heartland': ['sobha hartland', 'hartland'],
  'hadaeq sheikh mohammed bin rashid': [
    'mbr city',
    'mohammed bin rashid city',
    'district one',
    'meydan',
  ],
  'dubai production city': ['impz'],
  'silicon oasis': ['dso', 'dubai silicon oasis'],
  'dubai design district': ['d3'],
  'palm jabal ali': ['palm jebel ali'],
  'dubai investment park first': ['dip'],
  'dubai investment park second': ['dip'],
  'palm deira': ['dubai islands', 'deira islands'],
  'mina rashid': ['rashid yachts', 'rashid yachts and marina'],
};

/**
 * The primary marketing alias for an area's name_norm, for an optional
 * "· Downtown" hint shown next to the DLD name in the dropdown so users
 * recognise the area even without searching. Returns null when there's
 * no curated alias.
 */
export function primaryAlias(nameNorm: string): string | null {
  const list = AREA_SYNONYMS[(nameNorm || '').toLowerCase()];
  if (!list || list.length === 0) return null;
  // Title-case the first alias for display.
  return list[0]
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * True when an area option matches the (already lowercased+trimmed) query
 * either by its display name OR by any marketing synonym. Drop-in for the
 * old `o.name.toLowerCase().includes(q)` filter.
 */
export function areaMatchesQuery(
  opt: { name: string; name_norm: string },
  q: string,
): boolean {
  if (opt.name.toLowerCase().includes(q)) return true;
  const syns = AREA_SYNONYMS[(opt.name_norm || '').toLowerCase()];
  if (!syns) return false;
  return syns.some((s) => s.includes(q));
}
